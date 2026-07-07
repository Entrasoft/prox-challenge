# Design decisions

One line per non-obvious choice, with the reason. Seeds the README's
design-decisions section. Newest first.

## M3 — Eval harness

- **The harness runs the REAL agent** (`runAgent` from `src/agent/agent.ts`), so the thing
  graded is the thing shipped. Ambiguous questions are graded multi-turn via SDK session
  resume (turn 1 = clarify, turn 2 = answer).
- **`expected` filled from the KB, human-verified at the checkpoint** (eval-runner rule).
  Number-bearing answers derive from the M1-signed-off duty-cycle/specs tables.
- **Judge (Haiku) grades what it can assess.** It cannot see the manual, so it grades
  `correct` on *presence of the expected key facts + absence of contradicting/invented
  values* — not verbosity. The first rubric penalized rich, correct answers as "invented"
  (e.g. V4 re-presenting the selection chart's real six dimensions); the rubric was rewritten
  to fix that. Judge stays strict on wrong/invented numbers and missing safety warnings.
- **Capability grounding added to the agent** (system prompt): the process-selection chart is
  a *general* welding guide, not a statement of this machine's features. The eval caught the
  agent hallucinating **AC-TIG-for-aluminum** capability from the chart; the fix routes
  capability claims through the specs' per-process weldable materials (this welder's TIG is
  DC-only → can't TIG aluminum; aluminum is MIG+spool-gun only). This is an invariant #1 fix.
- **A4 `must_clarify` relaxed to false** *(human-checkpoint exception, per the eval-runner
  rule that exceptions get a note)*: "Can I weld aluminum with this?" is answerable correctly
  and completely without a clarifying question (yes via MIG+spool-gun, no via TIG). A direct
  answer beats an unnecessary question; forcing a clarify here would over-clarify.
- **Baseline ~89–93% answer-pass** (agent is non-deterministic). Known honest misses:
  **T5** — the agent sometimes leads with polarity for tall/ropey/no-penetration welds, where
  the manual's diagnosis is heat/travel-speed; a diagnostic-reasoning slip to improve, not
  papered over. **Visual coverage 0/20** by design — `<pxart>` blocks land in M4 (M4 exit is
  "visual evals pass"). Gate: answer-pass ≥ 85% + no regression vs the previous run.
- **Cost telemetry per run**: mean/p95 cost per question, agent vs judge split, and overall
  **cache hit rate** (a health metric — a broken breakpoint would drop it and ~10× cost). A
  full run is ~$0.8.

## M2 — Agent core

- **One agent definition (`src/agent/agent.ts`), consumed by route + M3 eval.** No
  divergent configs — the thing evals grade is the thing users hit (agent-sdk skill).
- **Numbers-from-KB via `lookup_table`; prose via `search_manual`; figures via
  `get_figure`.** Domain logic lives in `src/kb/store.ts` (pure, SDK-free,
  unit-tested); the four tools are thin wrappers returning JSON with `page`+`source`.
  `get_registry_props` is built now but unused until M4 wires the artifact grammar.
- **`searchManual` is lexical (deterministic), not embeddings.** No embedding API
  cost, fully reproducible; the manual is small enough that term-overlap scoring
  surfaces the right chunk (verified: "wire tensioner tight" → Wire Setup p17).
- **Multi-turn via SDK session `resume`, not client-sent history.** The result
  message's `session_id` flows to the client, which echoes it on the next turn — so
  clarify→answer is one conversation with the SDK holding history.
- **`tools: []` + `bypassPermissions`.** No built-in tools (only our KB tools exist);
  all tools are read-only KB reads, so skipping the permission prompt is safe and the
  server never hangs waiting for interactive approval. `settingSources: []` isolates
  the agent from the dev's `~/.claude`.
- **No extended thinking at runtime.** Snappy first token; the agentic tool loop does
  the reasoning. Revisit if cross-reference answers regress.
- **Markdown rendering pulled forward from M5.** The agent emits tables/bold/lists;
  plain-text rendering showed literal \`**\`/\`|\`, which read as broken. Added
  `react-markdown` + `remark-gfm` with dark prose styling (scrollable tables per
  design-system) — small change, large visible win, so it belongs with the first real
  answers rather than M5.
- **Cost is computed locally per answer and logged.** `resultToMeta` maps the SDK
  usage → `Usage` and prices it from `pricing.ts`; every request appends to
  `var/usage.jsonl` (SPEC §telemetry). Verified answers cost ~$0.013–0.03 with healthy
  cache reads.

## M1 — Extraction

- **Extraction = Messages API (`@anthropic-ai/sdk`), not the Agent SDK.** Per-page
  vision extraction is a single-shot task, not an agentic loop (claude-api skill).
  The Agent SDK is reserved for the M2 runtime.
- **Pipeline: render → classify → targeted extract → crop → Opus verify.** Sonnet
  4.6 classifies every page (section, text chunks, figure boxes, which tables
  appear); targeted Sonnet passes extract each typed table from the routed pages;
  Opus 4.8 re-reads the 4 critical artifacts against the source image cell-by-cell.
  ~$2.3 total. Product-agnostic: the welder is one entry in a `MANUALS` list.
- **Duty-cycle table is MIG/TIG/Stick only** (the manual's three spec tables on p7).
  Flux-cored has no printed duty-cycle table, so it is NOT a row — the shared-power-
  section fact lives in a note on the MIG entries. Asserting an unprinted flux-cored
  number would violate invariant #1. *(Human-checkpoint correction.)*
- **The OmniPro 220 is synergic** — no full thickness→settings lookup table exists in
  the manual. `synergic-settings.json` holds the printed worked examples (p20); the
  agent explains synergic derivation for thicknesses not shown rather than inventing
  values.
- **Added `polarity.json`** (beyond the skill's default kb layout): polarity is a core
  physical-setup answer and drives `PolarityDiagram`. Captured from quick-start p2 +
  owner setup pages; per-process electrode/ground terminal + DCEP/DCEN.
- **`process-selection.json`** captures the image-only "How to Choose a Welder" chart
  (`selection-chart.pdf` has no text layer) — the process decision matrix + MIG-vs-
  flux comparison.
- **Verification shares source-page routing with extraction** so the verifier sees the
  exact pages a table came from (fixed false-positive "mismatch" flags where the
  verifier was shown the wrong page).
- **KB schema is one Zod file** (`src/kb/schema.ts`), imported by both the pipeline and
  the M2 tools, so extraction output and runtime reads cannot drift.
- **Figures**: bounding-box crops with junk/size filtering (warning icons, tiny
  callouts dropped) → ~109 indexed figures; the four critical artifacts (process
  selection, wiring schematic, front panel, weld-tips) are captured. Tight figure
  surfacing is refined in M4.
- **Rendering via Ghostscript** (poppler/imagemagick absent on the machine); dev-time
  only, documented — reviewers never run extraction.

## M0 — Bootstrap

- **Next.js 16 (App Router) + React 19 + TypeScript strict.** Latest stable at
  scaffold time; single process hosts the React client and the Agent SDK route
  handler, per CLAUDE.md's "one `npm run dev`" rule.
- **Node 22 pinned (`.nvmrc`, `engines.node >=20.9`).** The machine's default
  Node is 18, below Next 16's floor (≥20.9); pinning keeps the two-minute rule
  honest for reviewers.
- **`check` runs ESLint directly, not `next lint`.** Next 16 removed the built-in
  `next lint`; `check = tsc --noEmit && eslint .`.
- **Tailwind v4 via `@tailwindcss/postcss`, config in CSS (`@theme`).** No
  `tailwind.config.js`; the artifact-protocol and design-system skills assume
  Tailwind classes exist.
- **Cost computed locally from `pricing.ts`, not read from the SDK.** The SDK's
  `total_cost_usd` is a client-side estimate from its own bundled price list;
  SPEC §telemetry wants our own rates as the source of truth (kept as a
  cross-check). All rates live in `src/agent/pricing.ts` and nowhere else.
- **Automatic prompt caching (SDK-managed), not hand-marked breakpoints.** The
  Agent SDK manages cache breakpoints itself; our job is to keep the custom
  system prompt + tool set byte-stable and push dynamic context into the user
  message. `excludeDynamicSections` only applies to the `claude_code` preset,
  which we don't use — this refines CLAUDE.md invariant #8's wording. (Verified
  against the SDK docs + installed `.d.ts`, 2026-07-07.)
- **NDJSON streaming contract in `src/agent/telemetry.ts`.** The route handler
  and the client parser both import the same event types so the wire format
  can't drift; M0 stands the whole path up with a hardcoded reply so M2 only
  swaps the producer for `query()`.
- **`settingSources: []` for the runtime agent (planned M2).** SDK isolation —
  don't inherit the developer's `~/.claude` settings or CLAUDE.md into the
  welding agent.
- **Repo reconciled onto `origin/main` in place.** The working copy started
  detached from the fork (`Entrasoft/prox-challenge`); wired up origin and reset
  onto it, then hoisted the bootstrap skills/evals to the repo root so Claude
  Code loads them project-wide.
- **KB-not-RAG for numbers (intent, implemented M1–M2).** Duty cycles, settings,
  polarities come from typed `kb/` table lookups cited to a page — never from
  model priors or fuzzy retrieval (CLAUDE.md invariant #1).
