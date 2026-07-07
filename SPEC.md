# SPEC — OmniPro 220 Specialist

Mission: a miniature Prox for one product. Manual in, product specialist out —
page-cited, visual-first, and pleasant for a garage DIYer standing in front of
the machine. The submission is graded on four axes; each maps to acceptance
criteria below, in two tiers. **Meets** = their stated bar. **Exceeds** = the
deliberate over-delivery that wins a founding-engineer challenge with 130 forks.

## Axis 1 — Deep technical accuracy

Meets:
- All `lookup` and `procedure` evals pass with correct values and page cites.
- Cross-reference questions (duty cycle × input voltage × process) resolve by
  combining KB tables, not by paraphrasing nearby text.
- `ambiguous` evals trigger exactly one clarifying question before answering.

Exceeds:
- Interpolation handled explicitly ("the chart lists 160A and 200A; at 180A
  expect between X% and Y% — here's the chart" + component).
- Out-of-manual questions answered honestly with the nearest in-manual fact.

## Axis 2 — Multimodal responses (the most important axis)

Meets:
- Polarity/setup answers render a diagram (SVG or registry component), never
  prose alone. Manual-figure questions surface the actual figure crop.
- At least these registry components exist and are agent-invokable:
  `DutyCycleCalculator`, `PolarityDiagram`, `SettingsConfigurator`,
  `TroubleshootingFlow`.
- Free-form artifacts (agent-written SVG/React) render in the sandbox with an
  error boundary and code-view fallback.

Exceeds:
- Hybrid strategy visibly at work: registry for the graded money-shots
  (deterministic, instant), generative artifacts for long-tail questions.
- Voice input/output via the browser Web Speech API (no second vendor key —
  preserves the single-key rule; mirrors Prox's dealer-tablet voice feature).
- Artifacts stream progressively rather than popping in after the text.

## Axis 3 — Tone and helpfulness

Meets: competent-friend voice; no condescension; safety warnings carried from
the manual where relevant; clarifies rather than guesses.

Exceeds: microcopy pass in the same voice (loading states, empty states,
error states); answers end with the one next thing to check, not a lecture.

## Axis 4 — Knowledge extraction quality

Meets:
- `kb/` contains typed JSON for every table (duty-cycle matrices, synergic
  settings, troubleshooting matrix, specs), a figure index with cropped
  images for every labeled diagram/photo, and page-anchored text chunks.
- The four image-only artifacts they named — process selection chart, weld
  diagnosis photos, wiring schematic, duty-cycle data — are all extracted,
  indexed, and surfaceable.

Exceeds:
- `kb/provenance.md` maps every KB file to source pages with a verification
  status column — extraction pass, machine verification pass, human check.
- README explains the pipeline as product-agnostic: the welder is one config;
  the same pipeline points at any manual. This is the founding-engineer story.

## Deliverables

1. The fork, satisfying the two-minute rule (clone → cp .env.example → npm
   install → npm run dev).
2. Hosted demo at `omnipro.relightlabs.ai` (rate-limited), linked at the top
   of the README.
3. README: architecture diagram, design decisions (KB-not-RAG for numbers,
   hybrid artifact strategy, model routing + per-answer cost), how knowledge
   is extracted/represented/verified, run instructions, eval results table.
4. Video walkthrough script (docs/video-outline.md): demo the three example
   questions from the challenge, one ambiguous question, one visual-only
   question, then 90 seconds of architecture.

## Milestones

- **M0 Bootstrap** — Populate `agent-sdk/references/` from live docs.
  Scaffold Next.js + TS app, `npm run check` green, `.env.example` in place.
  Exit: empty chat UI streams a hardcoded agent reply.
- **M1 Extraction** — `npm run extract` builds `kb/` from `files/`. Machine
  verification pass re-reads each table image against its own JSON.
  Exit: provenance.md complete; HUMAN CHECKPOINT — user signs off on
  duty-cycle and settings tables against the PDF before proceeding.
- **M2 Agent core** — SDK loop with `search_manual`, `lookup_table`,
  `get_figure`, `get_registry_props` tools; clarify-first policy; page-cited
  streaming answers in the UI. Exit: the three challenge example questions
  answer correctly in text with citations, and every response arrives with
  usage/cost metadata attached per SPEC §telemetry.
- **M3 Eval harness** — `npm run eval` per eval-runner skill. Fill
  `expected` fields in evals/questions.json from the KB. HUMAN CHECKPOINT —
  user spot-verifies expected answers. Exit: baseline report committed.
- **M4 Multimodal** — artifact-protocol end to end: stream parser, sandbox,
  figure crops, SVG, the four registry components, free-form React.
  Exit: `visual` evals pass; polarity answer renders a diagram unprompted.
- **M5 Polish + deploy** — design-system pass, mobile layout, voice, rate
  limiting, deploy to Fly/Railway, DNS `omnipro.relightlabs.ai`.
  Exit: Lighthouse mobile ≥ 90 perf/a11y; hosted demo answers the three
  example questions; cost chip and session ledger visible and correct
  against `var/usage.jsonl`.
- **M6 Ship** — README, video outline, final eval run ≥ 95% pass, tag
  `submission`, submit fork via useprox.com/join/challenge.

- **M7 Product twin (stretch — only after the `submission` tag exists)** —
  An interactive 3D model of the machine, agent-drivable, with phone AR.
  - **Asset** (the bottleneck; pick by access):
    (a) Physical machine available → photogrammetry scan (Object Capture /
    Polycam class tooling) → GLB + USDZ, cleaned to < 10 MB.
    (b) No machine → EITHER image-to-3D generation from the product photos
    already in the repo (accept "recognizable prop" quality), OR the
    **parametric panel twin**: model the front panel precisely from the
    manual's panel figure (Three.js primitives + the panel figure as
    texture; sockets/knobs/display as real geometry) on a simplified body.
    The panel is the only surface answers actually reference — accuracy
    budget goes there.
  - **Data**: `kb/model/annotations.json` — {partId, label, position,
    figureIds[], pages[]}. Annotations are KB data like everything else;
    this keeps the pipeline-generalization story intact.
  - **Viewer**: `<model-viewer>` web component for the fast path (inline 3D
    plus an AR button that hands off to Quick Look on iOS and Scene Viewer
    on Android — no WebXR code, works on the phones DIYers actually hold).
    Upgrade to react-three-fiber only if custom highlight animation is
    wanted.
  - **Agent integration** (the actual wow): new `model` artifact type per
    the artifact-protocol skill. "Which socket does the ground clamp go in
    for TIG?" → the model rotates to the socket panel, the correct socket
    pulses, page cite beneath. AR button places the machine at true scale —
    "will it fit on my bench" is a real DIYer question.
  - **Out of scope**: headset VR. The user has a phone in a garage, not a
    Quest. AR-at-true-scale is the value; immersive VR is demo candy.
  - Exit: eval P1 answered with the model artifact focused and highlighted;
    AR placement verified on one iOS and one Android device.

## Unit economics & cost telemetry (user-mandated feature, not a footnote)

Token consumption and cost are exposed end-to-end, per request:

- `src/agent/pricing.ts` — the pricing table as data (model → input/output
  rates, cache write 1.25×, cache read 0.1×), with the source URL and date
  in a comment. One file; nothing else hardcodes a rate.
- `src/agent/cost.ts` — computes per-response cost from the SDK's usage
  accounting (exact field names verified in M0 via the agent-sdk skill —
  token counts, cache write/read split, any per-result cost figure) and
  attaches {tokensIn, tokensOut, cacheRead, cacheWrite, costUsd, turns,
  latencyMs} to the streamed response metadata.
- **UI cost chip** — every answer's footer shows cost + latency, expanding
  to the full token/cache breakdown (spec in the design-system skill). A
  session ledger drawer shows the running conversation total.
- `var/usage.jsonl` — append-only log of every request's usage record;
  feeds the README's cost table and chart.
- **Eval integration** — the eval summary reports mean and p95 cost per
  question, per category, plus **cache hit rate**. Cache hit rate is a
  health metric, not trivia: a misconfigured cache breakpoint silently
  costs ~10×, and telemetry is the only way anyone notices.

Why this is a Prox signal: their product lives on manufacturers' product
pages, where the business math is cost per deflected support question.
A submission that measures and displays its own unit economics — target: a
few cents per answered question on Sonnet with healthy cache hits — is
speaking the founders' language.
