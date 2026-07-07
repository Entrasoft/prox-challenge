# Agent SDK — project wiring patterns

How THIS repo wires `@anthropic-ai/claude-agent-sdk` **0.3.202**. Read alongside
`typescript-api.md`. Written 2026-07-07; refresh both if the SDK version changes.

## One agent definition, two consumers

- The agent is defined **once** under `src/agent/` and imported by both the route
  handler (`src/app/api/chat/route.ts`) and the eval runner (`scripts/eval.ts`,
  M3). No divergent configs — the thing evals grade is the thing users hit.
- Planned shape (lands in M2):
  - `src/agent/agent.ts` — builds the `query()` options: custom `systemPrompt`
    (welding domain + safety + artifact-protocol rules), `model` from
    `pricing.ts`, `mcpServers` from the tool server, `allowedTools`,
    `maxTurns`, `settingSources: []` (isolation), `includePartialMessages: true`.
  - `src/agent/tools/*` — one file per tool; each is thin (validate input → call
    `src/kb/*` → return typed JSON **carrying `page`**). No domain logic in tools.
  - `src/agent/systemPrompt.ts` — the static system prompt (kept byte-stable so
    the cache prefix hits; dynamic per-question context goes in the user message).

## Tools are thin; domain logic is in `src/kb/`

- Tool handlers only: parse args (zod), call a `src/kb/` function, shape the
  result. Everything testable-without-the-SDK lives in `src/kb/` so it can be
  unit-tested directly (agent-sdk skill §Project conventions).
- Every tool result that asserts a manual fact includes `page`; the system prompt
  requires the model to cite pages it receives (CLAUDE.md invariant #1).
- Tool name → wire name is `mcp__<serverName>__<toolName>`; allowlist with the
  `mcp__omnipro__*` wildcard.

## Route handler streams SDK → client

- The route runs on the **Node.js runtime** (`export const runtime = "nodejs"`)
  because the SDK spawns a subprocess; it is also marked
  `serverExternalPackages` in `next.config.ts` so Next doesn't bundle it.
- The handler iterates `for await (const message of query(...))` and translates
  SDK messages into the NDJSON event grammar in `src/agent/telemetry.ts`:
  - `stream_event` (partial) → `{ t: "delta", v }` from the text-delta events.
  - the `result` message → `{ t: "meta", meta }` after mapping usage → `Usage`
    and computing cost via `src/agent/cost.ts`.
  - end → `{ t: "done" }`; failures → `{ t: "error", message }`.
- **M0 stands this path up with a hardcoded generator** in place of `query()`.
  Swapping in the real loop in M2 touches only the producer, not the transport,
  the event grammar, the client parser, or the cost path.

## Cost & telemetry flow (invariant #8)

- Read token/cache counts + `total_cost_usd` from the `result` message.
- Recompute cost locally from `pricing.ts` (single source of rates); attach
  `{ model, usage, costUsd, turns, latencyMs }` to the streamed `meta` event.
- Append every request's usage record to `var/usage.jsonl` (M5) for the README
  cost table and the eval cache-hit-rate health metric.

## Guards

- `maxTurns` on every `query()` call. Consider an `AbortController` wired to a
  wall-clock budget for the route. The eval runner additionally caps cost.

## Caching discipline

- Keep `systemPrompt` (custom string) and the tool set byte-stable across
  requests — any change to either invalidates the cache prefix. Put dynamic
  context in the user message. Watch cache-read tokens in telemetry: a silent
  drop to zero means a breakpoint broke and cost jumped ~10× (SPEC §telemetry).
