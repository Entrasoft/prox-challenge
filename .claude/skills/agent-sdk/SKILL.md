---
name: agent-sdk
description: Governs all code that imports or configures @anthropic-ai/claude-agent-sdk. Consult this skill BEFORE writing, editing, or debugging any agent loop, tool definition, MCP server wiring, streaming handler, session/permission config, or system-prompt setup — even for a one-line change, and even if the API "looks familiar." Also consult when an SDK call errors or types don't match expectations.
---

# Agent SDK usage rules

The Agent SDK evolves quickly. Code written from training memory produces
plausible-looking calls against APIs that have since changed — the worst kind
of bug for a timed challenge. So:

**Rule 1: never write SDK code from memory.** Before any SDK code, read the
files in `references/`. Cite the reference section in your plan.

**Rule 2: if `references/` is empty, populating it IS Milestone 0.** Do this:

1. Start from Anthropic's docs site map: `https://docs.claude.com/en/docs_site_map.md`
   and locate the current Agent SDK section (overview, TypeScript reference,
   permissions/sessions, custom tools/MCP, skills support).
2. Distill — do not mirror — into:
   - `references/typescript-api.md` — the query/entry API as it exists today,
     streaming event shapes, custom tool definition (SDK MCP server pattern),
     session handling, system-prompt configuration, model selection,
     prompt-caching hooks, and **usage accounting** — the exact fields for
     input/output token counts, cache write/read split, and any per-result
     cost figure the SDK reports. Verify names against the docs; never
     assume them. Include minimal working snippets verified against
     the docs, each annotated with its source URL and fetch date.
   - `references/patterns.md` — how THIS project wires it: one agent
     definition module, tools registered from `src/agent/tools/*`, cache
     breakpoints on system prompt + tool defs, max-turn and cost guards,
     how the route handler streams SDK events to the client.
3. Record SDK package version in both files. On any `npm update` of the SDK,
   refresh the references first, code second.

**Rule 3: errors trigger re-reading, not guessing.** SDK type errors or
runtime failures → re-read the relevant reference; if it's silent, refresh
from live docs, update the reference, then fix the code.

## Project conventions (stable regardless of SDK version)

- The agent is defined once in `src/agent/` and consumed by both the route
  handler and the eval runner — no divergent configs.
- Tools are thin: validate input, hit `kb/`, return typed JSON. All domain
  logic lives in `src/kb/` so it is unit-testable without the SDK.
- Every tool result that carries a manual fact includes `page` so the model
  can cite it; the system prompt requires citing pages it receives.
