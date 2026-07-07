/**
 * KB store — the single, SDK-free read layer over `kb/`.
 *
 * Loads and Zod-validates the committed knowledge base once, then exposes typed
 * lookups + lexical search. All domain logic lives here so the agent tools stay
 * thin (agent-sdk skill §conventions) and so this is unit-testable without the
 * SDK. Everything returned carries `page` + `source` for citation (invariant #1).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  DutyCycleEntry,
  SpecsDoc,
  PolarityEntry,
  SynergicSetting,
  TroubleshootingEntry,
  ProcessSelectionDoc,
  FigureIndexEntry,
  Chunk,
  Process,
  type InputVoltage,
} from "./schema";

const KB_DIR = path.join(process.cwd(), "kb");
const read = (rel: string) => readFileSync(path.join(KB_DIR, rel), "utf8");
const readJson = <T>(rel: string, schema: z.ZodType<T>): T => schema.parse(JSON.parse(read(rel)));

// ── Load once (module singletons) ────────────────────────────────────────────
const kb = {
  dutyCycle: readJson("tables/duty-cycle.json", z.array(DutyCycleEntry)),
  specs: readJson("tables/specs.json", SpecsDoc),
  polarity: readJson("tables/polarity.json", z.array(PolarityEntry)),
  synergic: readJson("tables/synergic-settings.json", z.array(SynergicSetting)),
  troubleshooting: readJson("tables/troubleshooting.json", z.array(TroubleshootingEntry)),
  processSelection: readJson("tables/process-selection.json", ProcessSelectionDoc),
  figures: readJson("figures/index.json", z.array(FigureIndexEntry)),
  chunks: read("chunks.jsonl")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => Chunk.parse(JSON.parse(l))),
};

// ── Typed table lookups ──────────────────────────────────────────────────────
export type ProcessName = z.infer<typeof Process>;

export function dutyCycle(filter: { process?: ProcessName; inputVoltage?: InputVoltage } = {}) {
  return kb.dutyCycle.filter(
    (e) =>
      (!filter.process || e.process === filter.process) &&
      (!filter.inputVoltage || e.inputVoltage === filter.inputVoltage),
  );
}

export function specs() {
  return kb.specs;
}

export function polarity(filter: { process?: ProcessName } = {}) {
  return kb.polarity.filter((e) => !filter.process || e.process === filter.process);
}

export function synergicSettings(filter: { process?: ProcessName; material?: string; query?: string } = {}) {
  return kb.synergic.filter(
    (e) =>
      (!filter.process || e.process === filter.process) &&
      (!filter.material || e.material.toLowerCase().includes(filter.material.toLowerCase())) &&
      (!filter.query || JSON.stringify(e).toLowerCase().includes(filter.query.toLowerCase())),
  );
}

export function troubleshooting(filter: { scope?: string; query?: string } = {}) {
  const q = filter.query?.toLowerCase();
  return kb.troubleshooting
    .filter((e) => !filter.scope || e.scope.toLowerCase().includes(filter.scope.toLowerCase()))
    .map((e) => ({ entry: e, score: q ? scoreText(q, `${e.symptom} ${JSON.stringify(e.causes)}`) : 1 }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.entry);
}

export function processSelection() {
  return kb.processSelection;
}

// ── Lexical search ───────────────────────────────────────────────────────────
const STOP = new Set(
  "the a an of to in on for and or is are be at it my me you your this that with how do i can what when where which welder weld welding".split(" "),
);
const tokenize = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));

/** Overlap score: sum of query-term frequencies in `text` (simple, deterministic). */
function scoreText(query: string, text: string): number {
  const terms = tokenize(query);
  if (!terms.length) return 0;
  const hay = text.toLowerCase();
  let score = 0;
  for (const t of terms) {
    let idx = hay.indexOf(t);
    while (idx !== -1) {
      score += 1;
      idx = hay.indexOf(t, idx + t.length);
    }
  }
  return score;
}

export function searchManual(query: string, topK = 6) {
  return kb.chunks
    .map((c) => ({ chunk: c, score: scoreText(query, `${c.section} ${c.section} ${c.text}`) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((r) => ({
      text: r.chunk.text,
      section: r.chunk.section,
      page: r.chunk.page,
      source: r.chunk.source,
      score: r.score,
    }));
}

export function findFigures(query: string, opts: { tags?: string[]; topK?: number } = {}) {
  const terms = new Set([...tokenize(query), ...(opts.tags ?? []).map((t) => t.toLowerCase())]);
  return kb.figures
    .map((f) => {
      const hay = `${f.id} ${f.caption} ${f.tags.join(" ")} ${f.kind}`.toLowerCase();
      let score = 0;
      for (const t of terms) if (hay.includes(t)) score += f.tags.map((x) => x.toLowerCase()).includes(t) ? 2 : 1;
      return { fig: f, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.topK ?? 4)
    .map((r) => ({
      id: r.fig.id,
      page: r.fig.page,
      source: r.fig.source,
      caption: r.fig.caption,
      kind: r.fig.kind,
      path: r.fig.path,
    }));
}

// ── Registry component props (data now; components render in M4) ──────────────
export const RegistryComponent = z.enum([
  "DutyCycleCalculator",
  "PolarityDiagram",
  "SettingsConfigurator",
  "TroubleshootingFlow",
]);
export type RegistryComponent = z.infer<typeof RegistryComponent>;

/** Build props for a registry component from the KB. Shape finalized in M4. */
export function registryProps(component: RegistryComponent, params: Record<string, unknown>) {
  const asProcess = (v: unknown): ProcessName | undefined => Process.safeParse(v).data;
  const asVoltage = (v: unknown): InputVoltage | undefined =>
    v === 120 || v === 240 ? (v as InputVoltage) : undefined;

  switch (component) {
    case "DutyCycleCalculator": {
      const process = asProcess(params.process) ?? "MIG";
      const entries = dutyCycle({ process, inputVoltage: asVoltage(params.inputVoltage) });
      const range = kb.specs.electrical.filter((e) => e.process === process);
      return { component, props: { process, entries, weldingCurrentRange: range, page: entries[0]?.page ?? kb.specs.page } };
    }
    case "PolarityDiagram": {
      const process = asProcess(params.process) ?? "TIG";
      const entry = polarity({ process })[0] ?? null;
      return { component, props: { process, polarity: entry } };
    }
    case "SettingsConfigurator": {
      const process = asProcess(params.process) ?? "MIG";
      return {
        component,
        props: {
          process,
          examples: synergicSettings({ process, material: params.material as string | undefined }),
          note: "This machine is synergic — set wire diameter + material thickness and it derives WFS/voltage.",
        },
      };
    }
    case "TroubleshootingFlow": {
      const rows = troubleshooting({ query: (params.symptom as string) ?? (params.query as string) ?? "" });
      return { component, props: { symptom: params.symptom ?? params.query ?? "", entries: rows.slice(0, 5) } };
    }
  }
}
