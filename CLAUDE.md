# OmniPro 220 Specialist — Prox Founding Engineer Challenge

A multimodal reasoning agent for the Vulcan OmniPro 220 welder, built on the
Claude Agent SDK. Grounded in the manual (in `files/`), cited to the page,
answering with visuals — not walls of text. Read `SPEC.md` for the full spec
and milestone plan before doing anything.

## Stack (decided — do not relitigate)

- **TypeScript everywhere.** Next.js (App Router) single app: React client +
  route handlers hosting the Agent SDK loop. One process, one `npm run dev`.
- **Agent SDK** `@anthropic-ai/claude-agent-sdk` for the runtime agent.
  Never write SDK code from memory — the `agent-sdk` skill governs this.
- **Models:** Sonnet 4.6 (`claude-sonnet-4-6`) is the runtime default and
  extraction workhorse. Haiku 4.5 for the eval judge. Opus 4.8 only for
  spot-verification passes during extraction. Fable-class models are not
  needed here; cost per answer is a design metric (see SPEC §Unit economics).
- **Prompt caching on every agent call**: system prompt + tool definitions
  marked as cache breakpoints.

## Commands

```
npm run dev      # app on :3000
npm run extract  # build kb/ from files/ manual (M1) — reviewers never run this
npm run eval     # eval battery, writes runs/<ts>.json + summary (M3)
npm run check    # typecheck + lint
```

## Invariants (violating any of these fails the challenge rubric)

1. **Numbers come from the KB, never from model priors.** Duty cycles,
   settings, torque values, polarities — every one is a `kb/` tool lookup,
   cited with a manual page number. If the KB lacks it, the agent says so.
2. **Physical-setup answers include a visual.** Polarity, cable routing,
   wire feed, panel controls → a manual figure crop, an SVG diagram, or a
   registry component. Text-only answers to physical questions are bugs.
3. **Ambiguous question → exactly one clarifying question**, then answer.
   Never a questionnaire; never guessing material/thickness/process silently.
4. **Two-minute rule:** `cp .env.example .env && npm install && npm run dev`
   must work from a fresh clone at every commit on `main`. `kb/` is
   committed for exactly this reason — extraction is a dev-time step.
5. **Evals gate milestones.** A milestone is done when `npm run eval` passes
   its exit criteria in SPEC.md. Regressions block merges.
6. **Safety carries through.** Surface the manual's warnings where relevant.
   Never advise defeating thermal/duty-cycle protection. Internal repairs →
   qualified service, per manual. Galvanized/coated metal → fume warning.
7. **Never commit `.env`.** `.env.example` documents `ANTHROPIC_API_KEY` only —
   the single-key requirement is part of the rubric.
8. **Every response carries its receipts.** Usage and computed cost flow
   SDK → route handler → client on every answer; all rates live in
   `src/agent/pricing.ts` and nowhere else. A response without usage
   metadata is a bug (SPEC §telemetry).

## Skills in this repo — consult before acting

- `agent-sdk` — mandatory before any SDK code. References are populated from
  live docs in Milestone 0; if `references/` is empty, that IS the task.
- `artifact-protocol` — the block grammar, stream parser, sandbox, and
  component registry contract. Agent prompt and client parser must both
  derive from this file so they cannot drift.
- `omnipro-knowledge` — KB schemas, figure index, welding domain conventions,
  safety phrasing, extraction + verification procedure.
- `design-system` — the UI bar. Consult for any component or screen work.
- `eval-runner` — how to run/extend the eval battery and read regressions.

## Working agreements

- Plan mode for architecture-heavy milestones (M0, M2, M4); execute the plan
  only after it's written down.
- Conventional commits, one commit per coherent unit, milestone tags
  (`m1-extraction`, `m2-agent-core`, ...).
- Ask the human only when a decision is irreversible, costs money, or is the
  M1/M3 human-verification checkpoint (their eyes are required there).
