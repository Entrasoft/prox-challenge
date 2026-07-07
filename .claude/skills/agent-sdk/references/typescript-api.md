# Agent SDK — TypeScript API reference (distilled)

Package: `@anthropic-ai/claude-agent-sdk` — **version 0.3.202** (pinned in `package.json`).
Peer deps: `zod ^4`, `@anthropic-ai/sdk >=0.93.0`, `@modelcontextprotocol/sdk ^1.29.0`.

Sources, fetched **2026-07-07**:
- https://code.claude.com/docs/en/agent-sdk/typescript
- https://code.claude.com/docs/en/agent-sdk/custom-tools
- https://code.claude.com/docs/en/agent-sdk/cost-tracking

Exact type names below were verified against the installed
`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` (not from the docs prose,
which paraphrases). On any `npm update` of the SDK, re-verify against the new
`.d.ts` before trusting these.

---

## Entry point: `query()`

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "…", // string | AsyncIterable<SDKUserMessage>
  options: { /* Options, see below */ },
})) {
  // message: SDKMessage (discriminated union on `type`)
}
```

`query(_params: { prompt; options? }): Query`, where `Query extends AsyncGenerator<SDKMessage, void>` and adds control methods: `interrupt()`, `setModel(model?)`, `setPermissionMode(mode)`, `close()`, etc. Iterate with `for await`.

## `Options` — fields this project uses

| Field | Type | Notes |
|---|---|---|
| `systemPrompt` | `string \| string[] \| { type: 'preset'; preset: 'claude_code'; append?: string; excludeDynamicSections?: boolean }` | We use a **custom string** (welding specialist), not the preset. See caching note. |
| `model` | `string` | e.g. `"claude-sonnet-4-6"`. Runtime default lives in `src/agent/pricing.ts`. |
| `mcpServers` | `Record<string, McpServerConfig>` | Our KB tools are registered here as an in-process SDK MCP server. |
| `allowedTools` | `string[]` | Auto-approve list; entries are `mcp__<server>__<tool>`. |
| `disallowedTools` | `string[]` | Remove tools from context. |
| `maxTurns` | `number` | Turn guard. |
| `includePartialMessages` | `boolean` | `true` to receive `stream_event` (token deltas) for progressive streaming. |
| `settingSources` | `SettingSource[]` | **Pass `[]`** for SDK isolation — otherwise it loads the dev's `~/.claude` + project settings + CLAUDE.md. |
| `abortController` | `AbortController` | Cancellation. |
| `resume` / `continue` | `string` / `boolean` | Multi-turn session continuation (`resume` takes a session id). |
| `outputFormat` | `{ type: 'json_schema'; schema }` | Structured output (used by the eval judge in M3, not the runtime agent). |

Also available: `agents`, `hooks`, `canUseTool`, `permissionMode`, `env`, `cwd`, `effort`, `thinking`, `maxThinkingTokens`, `fallbackModel`. Not needed for M2's core loop.

## Streamed messages: `SDKMessage` union (the ones we handle)

`SDKMessage` is a large union; the runtime cares about three variants.

```ts
// Final message of a query() call. subtype 'success' | error subtypes.
type SDKResultMessage = SDKResultSuccess | SDKResultError;

type SDKResultSuccess = {
  type: 'result';
  subtype: 'success';
  result: string;              // the final answer text
  duration_ms: number;
  num_turns: number;
  total_cost_usd: number;      // SDK's own estimate — we recompute from pricing.ts
  usage: NonNullableUsage;     // cumulative; see usage fields below
  modelUsage: Record<string, ModelUsage>;
  session_id: string;
  uuid: UUID;
  // …permission_denials, stop_reason, structured_output, etc.
};

type SDKResultError = {
  type: 'result';
  subtype: 'error_during_execution' | 'error_max_turns'
         | 'error_max_budget_usd' | 'error_max_structured_output_retries';
  total_cost_usd: number;      // present on errors too — always read cost from the result
  usage: NonNullableUsage;
  modelUsage: Record<string, ModelUsage>;
  errors: string[];
  session_id: string;
  // …
};

// One per model response step. Carries the assistant content + per-step usage.
type SDKAssistantMessage = {
  type: 'assistant';
  message: BetaMessage;        // nested; .id and .usage live here
  parent_tool_use_id: string | null;
  uuid: UUID;
  session_id: string;
};

// Emitted only when includePartialMessages:true — the token-delta stream.
type SDKPartialAssistantMessage = {
  type: 'stream_event';
  event: BetaRawMessageStreamEvent;   // Messages-API stream event (content_block_delta, …)
  parent_tool_use_id: string | null;
  uuid: UUID;
  session_id: string;
};
```

## Usage & cost accounting (CLAUDE.md invariant #8)

- **Read cost from the `result` message** (both success and error carry it): `total_cost_usd`, cumulative `usage`, and `modelUsage`.
- **`modelUsage: Record<string, ModelUsage>`** — per model:

  ```ts
  type ModelUsage = {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    webSearchRequests: number;
    costUSD: number;            // SDK estimate for this model
    contextWindow: number;
    maxOutputTokens: number;
  };
  ```

- **Per-step usage** is nested on the assistant message at `message.message.usage`
  with the Messages-API names: `input_tokens`, `output_tokens`,
  `cache_creation_input_tokens`, `cache_read_input_tokens`. **Deduplicate by
  `message.message.id`** — parallel tool calls repeat the same id with identical
  usage, and summing them double-counts.
- `total_cost_usd` / `costUSD` are the SDK's **client-side estimates** from a
  bundled price list. We map the token counts into `src/agent/telemetry.ts`'s
  `Usage` and compute cost from `src/agent/pricing.ts` (SPEC §telemetry); keep
  the SDK figure only as a cross-check.

## Custom tools — `tool()` + `createSdkMcpServer()`

```ts
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const lookupTable = tool(
  "lookup_table",                    // name → exposed as mcp__omnipro__lookup_table
  "Look up a value in a KB table, returned with its manual page.",
  { table: z.string(), key: z.string() },   // Zod raw shape; args are typed from it
  async (args) => ({
    content: [{ type: "text", text: JSON.stringify(/* kb result incl. page */) }],
    // optional: structuredContent, isError
  }),
  { annotations: { readOnlyHint: true } },   // read-only tools may run in parallel
);

const server = createSdkMcpServer({
  name: "omnipro",                   // → the {server} segment in mcp__omnipro__*
  version: "1.0.0",
  tools: [lookupTable /*, … */],
});
```

- Signature: `tool<Schema extends AnyZodRawShape>(name, description, inputSchema, handler, extras?): SdkMcpToolDefinition`. Handler returns `Promise<CallToolResult>` (`{ content: [...], structuredContent?, isError? }`).
- Register in `query({ options: { mcpServers: { omnipro: server }, allowedTools: ["mcp__omnipro__*"] } })`.
- **Error handling:** return `{ isError: true, content: [...] }` — do NOT throw. A thrown error kills the whole `query()` loop; `isError` lets the model see the failure and recover.
- Images from a tool: a content block `{ type: "image", data: <base64, no data: prefix>, mimeType }`. Useful for `get_figure` returning a manual crop.

## System prompt & prompt caching

- **Caching is automatic.** The SDK manages cache breakpoints; you do not pass `cache_control` yourself.
- With a **custom string** `systemPrompt`, the prefix caches as long as the string is byte-stable. `excludeDynamicSections` only affects the `claude_code` **preset**, not a custom string — so keep the welding system prompt static and push per-session/dynamic content into the user message.
- To place a cache boundary inside a custom prompt, use the `string[]` form with `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` (exported from the SDK): `systemPrompt: [staticInstructions, SYSTEM_PROMPT_DYNAMIC_BOUNDARY, sessionContext]`.
- 1-hour cache TTL: set env `ENABLE_PROMPT_CACHING_1H=1` (default is 5-minute). Our pricing table's `cacheWrite` assumes the 5-minute rate (1.25×).
