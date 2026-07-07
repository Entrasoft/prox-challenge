# Design decisions

One line per non-obvious choice, with the reason. Seeds the README's
design-decisions section. Newest first.

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
