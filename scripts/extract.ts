/**
 * npm run extract — build kb/ from the manual PDFs in files/.
 *
 * Pipeline (dev-time; reviewers never run this — kb/ is committed):
 *   1. Render every PDF page to PNG (Ghostscript).
 *   2. Classify pass (Sonnet, vision, per page) → section, page-anchored text
 *      chunks, figure candidates (with bounding boxes), and which typed tables
 *      appear on the page. Cached to kb/.work/index.json.
 *   3. Targeted extraction (Sonnet) → typed JSON for each table, routed to the
 *      right pages by the classify index, validated against src/kb/schema.ts.
 *   4. Figure crops (sharp) from the detected bounding boxes.
 *   5. Verification pass (Opus 4.8) re-reads the 4 critical artifacts against
 *      their source page image and confirms/corrects them cell-by-cell.
 *   6. Write kb/tables/*, kb/figures/*, kb/chunks.jsonl, kb/provenance.md.
 *
 * The pipeline is product-agnostic: the welder is one entry in MANUALS; point it
 * at any manual and the same passes run. Flags: --only <a,b>, --reclassify,
 * --no-verify.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { renderPdf, pageNumberOf } from "./lib/render";
import { pageImageBlock, cropBBox } from "./lib/images";
import { CostLedger, extractStructured, loadEnv, textBlock } from "./lib/model";
import { DEFAULT_MODEL, VERIFY_MODEL } from "../src/agent/pricing";
import {
  DutyCycleEntry,
  PolarityEntry,
  ProcessSelectionDoc,
  SpecsDoc,
  SynergicSetting,
  TroubleshootingEntry,
  FigureIndexEntry,
  Chunk,
  type Source,
} from "../src/kb/schema";

// ── Config ──────────────────────────────────────────────────────────────────
const KB = "kb";
const WORK = path.join(KB, ".work");
const PAGES = path.join(WORK, "pages");
const IMG_DIR = path.join(KB, "figures", "img");

const MANUALS: { source: Source; pdf: string; prefix: string }[] = [
  { source: "owner-manual", pdf: "files/owner-manual.pdf", prefix: "owner" },
  { source: "quick-start-guide", pdf: "files/quick-start-guide.pdf", prefix: "quickstart" },
  { source: "selection-chart", pdf: "files/selection-chart.pdf", prefix: "selection" },
];

const ARTIFACTS = ["specs", "duty-cycle", "polarity", "synergic-settings", "troubleshooting", "process-selection"] as const;
type Artifact = (typeof ARTIFACTS)[number];

// ── Classify-pass schema (per page) ──────────────────────────────────────────
const PageIndex = z.object({
  section: z.string(),
  artifacts: z.array(z.enum(ARTIFACTS)),
  figures: z.array(
    z.object({
      label: z.string(),
      caption: z.string(),
      kind: z.enum(["panel", "diagram", "photo", "schematic", "chart", "figure"]),
      tags: z.array(z.string()),
      bbox: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
    }),
  ),
  chunks: z.array(z.object({ text: z.string(), section: z.string() })),
});
type PageIndex = z.infer<typeof PageIndex>;
type IndexedPage = PageIndex & { source: Source; page: number; png: string };

const ledger = new CostLedger();
const arg = (name: string) => process.argv.includes(name);
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const ONLY: Set<string> | null = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",")) : null;
const want = (phase: string) => !ONLY || ONLY.has(phase);

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  loadEnv();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set. Put it in .env (cp .env.example .env) and retry.");
    process.exit(1);
  }
  mkdirSync(IMG_DIR, { recursive: true });
  mkdirSync(path.join(KB, "tables"), { recursive: true });

  // 1. Render
  const byPage = new Map<string, string>(); // `${source}:${page}` -> png path
  for (const m of MANUALS) {
    const files = renderPdf(m.pdf, PAGES, m.prefix);
    for (const f of files) byPage.set(`${m.source}:${pageNumberOf(f)}`, f);
  }
  console.log(`rendered ${byPage.size} pages`);

  // 2. Classify (cached)
  const index = await classify(byPage);

  // 3. Targeted table extraction, routed by the index
  const pagesWith = (a: Artifact) => index.filter((p) => p.artifacts.includes(a));

  if (want("specs")) {
    // The rated tables are on the specs page; circuit/breaker requirements live
    // in the power-cord setup text (detected by content, not a hardcoded page).
    const specPages = specsSourcePages(index);
    if (specPages.length) {
      const specs = await extractStructured(SpecsDoc, {
        model: DEFAULT_MODEL, ledger, label: "specs", schemaHint: true,
        system:
          "You extract the Specifications for the Vulcan OmniPro 220 welder from the page image(s). Capture ratings, " +
          "welding current ranges, weldable materials per process, wire capacities, wire speed, spool capacity, max OCV, " +
          "and circuit requirements. For circuitRequirements, read the power-cord setup text: capture the receptacle rating " +
          "(e.g. 120VAC 20-amp), the required breaker type (e.g. delayed-action / GFCI), and plug type. If a breaker AMP " +
          "size is not explicitly printed for a voltage, set recommendedBreakerAmps to null but record the requirement in " +
          "notes. Use exact printed numbers. source is 'owner-manual'.",
        content: [textBlock("Extract the specifications as a SpecsDoc object."), ...(await imageBlocks(specPages))],
      });
      writeJson("tables/specs.json", specs);
      console.log("✓ specs.json");
    }
  }

  if (want("duty-cycle")) {
    // The rated duty-cycle table is authoritative on the specs page. Pages 19/29
    // only re-illustrate the same values, so extract from the specs page alone to
    // keep one canonical entry per process×voltage (no duplicates).
    const dutyPages = dutySourcePages(index);
    if (dutyPages.length) {
      const duty = await extractStructured(z.array(DutyCycleEntry), {
        model: DEFAULT_MODEL, ledger, label: "duty-cycle", schemaHint: true,
        system:
          "You extract the RATED DUTY CYCLE table for the OmniPro 220 from the specifications page. The page has EXACTLY " +
          "THREE process tables: MIG, TIG, and Stick — there is NO separate Flux-Cored duty-cycle table. Emit exactly one " +
          "entry per (process, inputVoltage) for those three processes ONLY (6 entries: MIG/TIG/Stick × 120/240). Do NOT " +
          "invent a Flux-Cored entry. On each MIG entry, add a note that flux-cored wire runs on the same MIG power section, " +
          "so flux-cored duty cycle matches the MIG values (the manual prints no separate flux-cored figure). Each entry's " +
          "points are the printed {amps, dutyPct} pairs. Duty cycle is on a 10-minute basis. Use exact printed values. " +
          "source is 'owner-manual', page is the specifications page.",
        content: [textBlock("Extract the rated duty-cycle table (MIG, TIG, Stick only) as a DutyCycleEntry[]."), ...(await imageBlocks(dutyPages))],
      });
      writeJson("tables/duty-cycle.json", duty);
      console.log(`✓ duty-cycle.json (${duty.length} entries)`);
    }
  }

  if (want("polarity")) {
    // Polarity/cable-setup lives in the owner manual setup pages AND the quick-start back page.
    const polPages = dedupePages(pagesWith("polarity"));
    const qsBack = index.find((p) => p.source === "quick-start-guide" && p.page === 2);
    if (qsBack) polPages.push(qsBack);
    if (polPages.length) {
      const imgs = await imageBlocks(dedupePages(polPages));
      const pol = await extractStructured(z.array(PolarityEntry), {
        model: DEFAULT_MODEL, ledger, label: "polarity", schemaHint: true,
        system:
          "You extract POLARITY / cable-setup for each welding process on the OmniPro 220 from the image(s). For each " +
          "process (MIG solid-wire, Flux-Cored self-shielded, TIG, Stick) record which terminal the electrode/wire/torch " +
          "lead connects to and which terminal the ground (work) clamp connects to, the DCEP/DCEN label that implies, and " +
          "the cable-setup steps as written. Read polarity off THIS machine's instructions only. Set the correct source " +
          "for each entry ('owner-manual' or 'quick-start-guide').",
        content: [textBlock("Extract polarity per process as a PolarityEntry[]."), ...imgs],
      });
      writeJson("tables/polarity.json", pol);
      console.log(`✓ polarity.json (${pol.length} entries)`);
    }
  }

  if (want("synergic-settings")) {
    const setPages = dedupePages(pagesWith("synergic-settings"));
    if (setPages.length) {
      const imgs = await imageBlocks(setPages);
      const settings = await extractStructured(z.array(SynergicSetting), {
        model: DEFAULT_MODEL, ledger, label: "synergic-settings", schemaHint: true,
        system:
          "You extract RECOMMENDED / SYNERGIC SETTINGS for the OmniPro 220 from the image(s): any table or text giving " +
          "wire feed speed, voltage/heat, gas type and SCFH flow, by process + material + thickness + wire/electrode size. " +
          "Mark isSynergicProgramInput true when the value is an input the machine's synergic program derives from " +
          "(e.g. material thickness), false when it is a manual override. If the manual only references an on-machine " +
          "Settings Chart without printing the values, capture what IS printed and note the reference. Set source correctly.",
        content: [textBlock("Extract recommended/synergic settings as a SynergicSetting[]."), ...imgs],
      });
      writeJson("tables/synergic-settings.json", settings);
      console.log(`✓ synergic-settings.json (${settings.length} entries)`);
    } else {
      console.log("… no synergic-settings pages detected; leaving table empty");
      if (!existsSync(path.join(KB, "tables/synergic-settings.json"))) writeJson("tables/synergic-settings.json", []);
    }
  }

  if (want("troubleshooting")) {
    const tsPages = dedupePages(pagesWith("troubleshooting"));
    const entries: TroubleshootingEntry[] = [];
    for (const p of tsPages) {
      const imgs = await imageBlocks([p]);
      const part = await extractStructured(z.array(TroubleshootingEntry), {
        model: DEFAULT_MODEL, ledger, label: `troubleshooting-p${p.page}`, schemaHint: true,
        system:
          "You extract the TROUBLESHOOTING matrix on this page for the OmniPro 220. Each row is a symptom with a list of " +
          "possible causes each paired with its likely solution/check. Preserve any 'see page N' references in pageRef. " +
          "Set scope to the section title (e.g. 'MIG/Flux-Cored Welding' or 'TIG/Stick Welding'). source is 'owner-manual'.",
        content: [textBlock(`Extract every troubleshooting row on page ${p.page} as a TroubleshootingEntry[].`), ...imgs],
      });
      entries.push(...part);
    }
    writeJson("tables/troubleshooting.json", entries);
    console.log(`✓ troubleshooting.json (${entries.length} entries)`);
  }

  if (want("process-selection")) {
    const sel = index.find((p) => p.source === "selection-chart") ?? pagesWith("process-selection")[0];
    if (sel) {
      const imgs = await imageBlocks([sel]);
      const doc = await extractStructured(ProcessSelectionDoc, {
        model: DEFAULT_MODEL, ledger, label: "process-selection", schemaHint: true,
        system:
          "You extract the 'How to Choose a Welder' process-selection chart for the OmniPro 220 from the image. Capture, " +
          "per process column (Flux-Cored/FCAW, MIG/GMAW, Stick/SMAW, TIG/GTAW): skill level, gas requirement, materials, " +
          "thickness range, typical applications, weld cleanliness, and advantages. Also capture the MIG-vs-Flux-Cored " +
          "comparison table (attribute → which process checks) and the duty-cycle explanation text. source is 'selection-chart'.",
        content: [textBlock("Extract the process-selection chart as a ProcessSelectionDoc."), ...imgs],
      });
      writeJson("tables/process-selection.json", doc);
      console.log("✓ process-selection.json");
    }
  }

  // 4. Figures — crop detected bounding boxes + write index
  if (want("figures")) await buildFigures(index, byPage);

  // 5. Chunks
  if (want("chunks")) {
    const chunks: Chunk[] = index.flatMap((p) =>
      p.chunks.map((c) => Chunk.parse({ text: c.text, page: p.page, source: p.source, section: c.section })),
    );
    writeFileSync(path.join(KB, "chunks.jsonl"), chunks.map((c) => JSON.stringify(c)).join("\n") + "\n");
    console.log(`✓ chunks.jsonl (${chunks.length} chunks)`);
  }

  // 6. Verify critical artifacts (Opus) + provenance
  if (!arg("--no-verify") && want("verify")) await verifyAndProvenance(index);

  ledger.print();
}

// ── Classify pass ─────────────────────────────────────────────────────────────
async function classify(byPage: Map<string, string>): Promise<IndexedPage[]> {
  const cachePath = path.join(WORK, "index.json");
  if (existsSync(cachePath) && !arg("--reclassify")) {
    console.log("using cached classify index (kb/.work/index.json); pass --reclassify to rebuild");
    return JSON.parse(readFileSync(cachePath, "utf8"));
  }
  const out: IndexedPage[] = [];
  for (const m of MANUALS) {
    for (const [key, png] of byPage) {
      if (!key.startsWith(`${m.source}:`)) continue;
      const page = Number(key.split(":")[1]);
      const img = await pageImageBlock(png);
      const idx = await extractStructured(PageIndex, {
        model: DEFAULT_MODEL, ledger, label: `classify ${m.source} p${page}`, schemaHint: true, maxTokens: 6000,
        system:
          "You are indexing one page of a welder manual for a knowledge base. Identify the section title, transcribe the " +
          "readable body text into one or more clean page-anchored chunks (drop headers/footers/sidebars), detect labeled " +
          "figures/diagrams/photos/schematics/charts/control-panels with a tight normalized [0..1] bounding box and " +
          "generous tags, and flag which of these typed tables appear on the page: " +
          ARTIFACTS.join(", ") +
          ". Only flag a table artifact if the actual table/data is on THIS page.",
        content: [textBlock(`Index this page (source=${m.source}, page=${page}).`), img],
      });
      out.push({ ...idx, source: m.source, page, png });
      console.log(`  indexed ${m.source} p${page}: [${idx.artifacts.join(",") || "-"}] ${idx.figures.length} figs`);
    }
  }
  writeFileSync(cachePath, JSON.stringify(out, null, 2));
  return out;
}

// ── Figures ───────────────────────────────────────────────────────────────────
// Decorative marks the classify pass over-detects as "figures".
const FIGURE_JUNK = /warning|hazard|\bicon\b|logo|arc[- ]?ray|electric[- ]?shock|\bfire\b|explosion|save[- ]these|read[- ]?(the )?manual|caution symbol|safety symbol/i;

async function buildFigures(index: IndexedPage[], byPage: Map<string, string>) {
  // Clear old crops so re-runs don't leave orphans not referenced by the index.
  rmSync(IMG_DIR, { recursive: true, force: true });
  mkdirSync(IMG_DIR, { recursive: true });
  const entries: FigureIndexEntry[] = [];
  const seen = new Set<string>();
  for (const p of index) {
    for (const f of p.figures) {
      // Keep substantial, meaningful figures: drop tiny crops and decorative icons.
      if (f.bbox.w * f.bbox.h < 0.02) continue;
      if (f.bbox.w < 0.08 || f.bbox.h < 0.04) continue;
      const hay = `${f.label} ${f.caption} ${f.tags.join(" ")}`;
      if (FIGURE_JUNK.test(hay)) continue;
      const slug = f.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "fig";
      let id = `fig-p${p.page}-${slug}`;
      let n = 2;
      while (seen.has(id)) id = `fig-p${p.page}-${slug}-${n++}`;
      seen.add(id);
      const rel = path.posix.join("figures", "img", `${id}.png`);
      const png = byPage.get(`${p.source}:${p.page}`)!;
      await cropBBox(png, f.bbox, path.join(KB, rel));
      entries.push(
        FigureIndexEntry.parse({
          id, page: p.page, source: p.source, caption: f.caption, kind: f.kind, tags: f.tags, path: rel, bbox: f.bbox,
        }),
      );
    }
  }
  writeJson("figures/index.json", entries);
  console.log(`✓ figures/index.json (${entries.length} figures cropped)`);
}

// ── Verification + provenance ──────────────────────────────────────────────────
const Verdict = z.object({
  status: z.enum(["verified", "corrected", "issues"]),
  matchesSource: z.boolean(),
  corrections: z.array(z.string()),
  notes: z.string(),
});

async function verifyAndProvenance(index: IndexedPage[]) {
  const rows: { file: string; pages: string; status: string; notes: string }[] = [];

  const critical: { file: string; artifact: Artifact }[] = [
    { file: "tables/duty-cycle.json", artifact: "duty-cycle" },
    { file: "tables/specs.json", artifact: "specs" },
    { file: "tables/process-selection.json", artifact: "process-selection" },
    { file: "tables/synergic-settings.json", artifact: "synergic-settings" },
  ];

  for (const c of critical) {
    const fp = path.join(KB, c.file);
    if (!existsSync(fp)) continue;
    const json = readFileSync(fp, "utf8");
    const pages = sourcePagesFor(c.artifact, index);
    if (!pages.length) {
      rows.push({ file: c.file, pages: "—", status: "extraction pass", notes: "no source page in classify index" });
      continue;
    }
    const imgs = await imageBlocks(pages);
    const v = await extractStructured(Verdict, {
      model: VERIFY_MODEL, ledger, label: `verify ${c.file}`, schemaHint: true, think: true,
      system:
        "You are verifying an extracted knowledge-base table against its SOURCE PAGE IMAGE(S), cell by cell. You are given " +
        "ALL the pages the table was extracted from — a value may come from any of them. Compare every value in the JSON to " +
        "what the images actually show. Report matchesSource=false only if a printed value is transcribed WRONG or a printed " +
        "value is MISSING. Do NOT flag as a discrepancy: (a) a record whose notes explicitly say it reuses another process's " +
        "values because the manual states they share an electrical section (e.g. Flux-Cored reusing the MIG section) when " +
        "those reused values are correct; (b) derived/aggregate fields (model name, item number) that are correct even if not " +
        "printed on every page. Set status to 'verified' (all correct), 'corrected' (you list concrete fixes), or 'issues'.",
      content: [textBlock(`Verify this extracted JSON against the source page(s):\n\n${json}`), ...imgs],
    });
    const pagesLabel = pages.map((p) => `${p.source} p${p.page}`).join(", ");
    rows.push({
      file: c.file,
      pages: pagesLabel,
      status: v.matchesSource ? "✅ machine-verified" : "⚠️ discrepancies",
      notes: [v.notes, ...v.corrections.map((x) => `correction: ${x}`)].filter(Boolean).join("; "),
    });
    console.log(`  verified ${c.file}: ${v.status} (matches=${v.matchesSource})`);
  }

  // Non-critical tables: extraction pass only (no machine verification).
  for (const f of ["tables/polarity.json", "tables/troubleshooting.json"]) {
    if (!existsSync(path.join(KB, f))) continue;
    const art = f.includes("polarity") ? "polarity" : "troubleshooting";
    const pages = dedupePages(index.filter((p) => p.artifacts.includes(art as Artifact)));
    rows.push({ file: f, pages: pages.map((p) => `${p.source} p${p.page}`).join(", ") || "—", status: "extraction pass", notes: "" });
  }
  rows.push({ file: "figures/index.json", pages: "various", status: "extraction pass", notes: "bounding-box crops; spot-check at human checkpoint" });
  rows.push({ file: "chunks.jsonl", pages: "all", status: "extraction pass", notes: "page-anchored text for search_manual" });

  writeProvenance(rows);
}

function writeProvenance(rows: { file: string; pages: string; status: string; notes: string }[]) {
  const lines = [
    "# KB provenance",
    "",
    "Every `kb/` file, the manual pages it was extracted from, and its verification status.",
    "Extraction: Sonnet 4.6 vision over Ghostscript-rendered pages. Machine verification: Opus 4.8",
    "re-reads the four critical artifacts against the source page image cell-by-cell (SPEC M1).",
    "The **human checkpoint** (duty-cycle + synergic-settings sign-off) is the final gate.",
    "",
    "| File | Source pages | Status | Notes |",
    "| --- | --- | --- | --- |",
    ...rows.map((r) => `| \`${r.file}\` | ${r.pages} | ${r.status} | ${r.notes.replace(/\|/g, "\\|")} |`),
    "",
    "## Verification tiers",
    "- **machine-verified** — Opus 4.8 re-read the JSON against the page image and confirmed every value.",
    "- **extraction pass** — Sonnet 4.6 extraction only; spot-checked by a human at the checkpoint.",
    "- **discrepancies** — verification flagged a mismatch; see the note and re-run `--only <artifact>`.",
    "",
  ];
  writeFileSync(path.join(KB, "provenance.md"), lines.join("\n"));
  console.log("✓ provenance.md");
}

// ── source-page routing (shared by extraction AND verification, so the verifier
//    sees exactly the pages a table was extracted from) ─────────────────────────
const CIRCUIT_RE = /circuit breaker|breaker or fuses|amp[- ]?rated|delayed[- ]?action|\b20 amp\b|receptacle/i;
function pagesWithArtifact(index: IndexedPage[], a: Artifact): IndexedPage[] {
  return index.filter((p) => p.artifacts.includes(a));
}
function specsSourcePages(index: IndexedPage[]): IndexedPage[] {
  const circuit = index.filter((p) => p.chunks.some((c) => CIRCUIT_RE.test(c.text)));
  return dedupePages(pagesWithArtifact(index, "specs").concat(circuit));
}
function dutySourcePages(index: IndexedPage[]): IndexedPage[] {
  return pagesWithArtifact(index, "specs");
}
/** The pages a critical artifact's JSON was extracted from — used to route verification. */
function sourcePagesFor(artifact: Artifact, index: IndexedPage[]): IndexedPage[] {
  switch (artifact) {
    case "specs": return specsSourcePages(index);
    case "duty-cycle": return dutySourcePages(index);
    case "process-selection": return index.filter((p) => p.source === "selection-chart");
    default: return dedupePages(pagesWithArtifact(index, artifact));
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────
function dedupePages(pages: IndexedPage[]): IndexedPage[] {
  const seen = new Set<string>();
  return pages.filter((p) => {
    const k = `${p.source}:${p.page}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
async function imageBlocks(pages: IndexedPage[]) {
  return Promise.all(pages.map((p) => pageImageBlock(p.png)));
}
function writeJson(rel: string, data: unknown) {
  const fp = path.join(KB, rel);
  mkdirSync(path.dirname(fp), { recursive: true });
  writeFileSync(fp, JSON.stringify(data, null, 2) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
