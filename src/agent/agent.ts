/**
 * The OmniPro 220 agent — defined once, consumed by both the chat route
 * (src/app/api/chat/route.ts) and the eval runner (M3). No divergent configs:
 * the thing evals grade is the thing users hit (agent-sdk skill §conventions).
 */

import { query, type Query, type Options, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { omniproServer, ALLOWED_TOOLS, MCP_SERVER_NAME } from "./tools";
import { SYSTEM_PROMPT } from "./systemPrompt";
import { DEFAULT_MODEL } from "./pricing";
import { computeCostUsd } from "./cost";
import type { ResponseMeta, Usage } from "./telemetry";

export interface RunAgentArgs {
  /** The user's message for this turn. */
  prompt: string;
  /** Session id from a prior turn's result, to continue the conversation (clarify → answer). */
  resume?: string;
  abortController?: AbortController;
}

/** Start one agent turn. Returns the SDK Query async-generator to iterate. */
export function runAgent({ prompt, resume, abortController }: RunAgentArgs): Query {
  const options: Options = {
    systemPrompt: SYSTEM_PROMPT,
    model: DEFAULT_MODEL,
    mcpServers: { [MCP_SERVER_NAME]: omniproServer },
    allowedTools: ALLOWED_TOOLS,
    tools: [], // no built-in tools — the agent only has our KB tools
    includePartialMessages: true, // stream text deltas
    settingSources: [], // SDK isolation — don't inherit ~/.claude or CLAUDE.md
    maxTurns: 8,
    // All our tools are read-only KB lookups; skip the permission prompt so the
    // server never hangs waiting for interactive approval.
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    ...(resume ? { resume } : {}),
    ...(abortController ? { abortController } : {}),
  };
  return query({ prompt, options });
}

/**
 * Map an SDK `result` message into our telemetry contract, pricing the tokens
 * locally from pricing.ts (SPEC §telemetry — the SDK's total_cost_usd is only a
 * cross-check). Works for both success and error results.
 */
export function resultToMeta(result: SDKResultMessage): ResponseMeta {
  const u = result.usage;
  const usage: Usage = {
    tokensIn: u.input_tokens ?? 0,
    tokensOut: u.output_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
  };
  return {
    model: DEFAULT_MODEL,
    usage,
    costUsd: computeCostUsd(DEFAULT_MODEL, usage),
    turns: result.num_turns,
    latencyMs: result.duration_ms,
    sessionId: result.session_id,
  };
}
