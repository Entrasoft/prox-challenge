/**
 * The telemetry contract shared by the route handler and the client (CLAUDE.md
 * invariant #8, SPEC §telemetry). Both the SSE producer and the parser import
 * these types so the wire format cannot drift.
 */

import type { ModelId } from "./pricing";

/** Token counts for one answer. `tokensIn` is the UNCACHED input remainder. */
export interface Usage {
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  cacheWrite: number;
}

/** Everything a rendered answer carries in its footer / cost chip. */
export interface ResponseMeta {
  model: ModelId;
  usage: Usage;
  costUsd: number;
  turns: number;
  latencyMs: number;
  /** SDK session id — the client sends it back so a clarify→answer pair is one conversation. */
  sessionId?: string;
}

/**
 * Newline-delimited JSON (NDJSON) event grammar streamed from /api/chat.
 * One JSON object per line:
 *   {"t":"status","v":"Checking the duty-cycle chart…"} — transient tool-activity line
 *   {"t":"delta","v":"partial text"}   — append to the current answer
 *   {"t":"meta","meta":{...}}          — usage/cost, emitted once before done
 *   {"t":"error","message":"..."}      — a plain-words failure
 *   {"t":"done"}                       — stream complete
 */
export type ChatStreamEvent =
  | { t: "status"; v: string }
  | { t: "delta"; v: string }
  | { t: "meta"; meta: ResponseMeta }
  | { t: "error"; message: string }
  | { t: "done" };
