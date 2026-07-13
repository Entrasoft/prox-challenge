/**
 * Chat endpoint — the real Agent SDK loop (M2).
 *
 * Iterates the agent's streamed messages and translates them into the NDJSON
 * event grammar in src/agent/telemetry.ts: token deltas → `delta`, the final
 * result → `meta` (usage + locally-computed cost + sessionId), then `done`.
 * The transport and event grammar are unchanged from M0, so the client parser
 * and cost chip work as-is. Multi-turn (clarify → answer) rides on the SDK
 * session: the client echoes the `sessionId` from the last meta.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { runAgent, resultToMeta } from "@/agent/agent";
import type { ChatStreamEvent, ResponseMeta } from "@/agent/telemetry";
import { rateLimit, clientIp } from "@/lib/rateLimit";

/** Map a tool call to a calm, product-voice status line (design-system). */
function statusFor(name: string, input: Record<string, unknown>): string {
  const tool = name.replace(/^mcp__omnipro__/, "");
  if (tool === "lookup_table") {
    const table = String(input.table ?? "");
    const phrase: Record<string, string> = {
      "duty-cycle": "Checking the duty-cycle chart…",
      specs: "Checking the specifications…",
      polarity: "Checking the polarity setup…",
      "synergic-settings": "Checking the settings…",
      troubleshooting: "Checking the troubleshooting guide…",
      "process-selection": "Checking the process chart…",
    };
    return phrase[table] ?? "Checking the manual's tables…";
  }
  if (tool === "search_manual") return "Reading the manual…";
  if (tool === "get_figure") return "Finding the right figure…";
  if (tool === "get_registry_props") return "Building the diagram…";
  return "Working on it…";
}

// The Agent SDK spawns a subprocess — Node.js runtime, no static optimization.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Emit one structured access line per real chat request. Goes to stdout, which
 * Cloud Run captures into Cloud Logging as `jsonPayload` — queryable and durable
 * across instance scaling (unlike the ephemeral /tmp usage log). Lets us tell a
 * genuine visitor (real IP + browser UA) apart from our own tests: the Cloud Run
 * request log masks the client as Google's edge proxy, but the app sees the real
 * client via clientIp()'s x-forwarded-for / cf-connecting-ip resolution.
 */
function logAccess(req: Request, message: string) {
  try {
    console.log(
      JSON.stringify({
        evt: "chat_access",
        at: new Date().toISOString(),
        ip: clientIp(req),
        ua: req.headers.get("user-agent") ?? "unknown",
        ref: req.headers.get("referer") ?? null,
        msgPreview: message.slice(0, 80),
      }),
    );
  } catch {
    // access logging must never break a response
  }
}

/** Append one usage record per request for the README cost table + eval health (SPEC §telemetry). */
function logUsage(meta: ResponseMeta) {
  try {
    // Configurable so it can point at /tmp on a read-only container filesystem (Cloud Run).
    const dir = process.env.USAGE_LOG_DIR ?? path.join(process.cwd(), "var");
    mkdirSync(dir, { recursive: true });
    appendFileSync(
      path.join(dir, "usage.jsonl"),
      JSON.stringify({ at: new Date().toISOString(), ...meta }) + "\n",
    );
  } catch {
    // telemetry logging must never break a response
  }
}

export async function POST(req: Request): Promise<Response> {
  const limit = rateLimit(clientIp(req));
  if (!limit.ok) {
    return new Response(
      JSON.stringify({ error: "rate_limited", retryAfter: limit.retryAfter }),
      { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(limit.retryAfter) } },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { message?: string; sessionId?: string };
  const message = (body.message ?? "").trim();
  if (!message) {
    return new Response(JSON.stringify({ error: "empty message" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  logAccess(req, message);

  const encoder = new TextEncoder();
  const abortController = new AbortController();
  req.signal.addEventListener("abort", () => abortController.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatStreamEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));

      try {
        for await (const msg of runAgent({ prompt: message, resume: body.sessionId, abortController })) {
          // Token deltas of the assistant's visible text.
          if (msg.type === "stream_event") {
            const ev = msg.event;
            if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
              send({ t: "delta", v: ev.delta.text });
            }
            continue;
          }
          // A calm status line while the agent works a tool (before text arrives).
          if (msg.type === "assistant") {
            for (const block of msg.message.content) {
              if (block.type === "tool_use") send({ t: "status", v: statusFor(block.name, block.input) });
            }
            continue;
          }
          // End of the turn: usage/cost + session id, then done.
          if (msg.type === "result") {
            const meta = resultToMeta(msg);
            logUsage(meta);
            if (msg.subtype !== "success") {
              send({ t: "error", message: "The agent hit an error finishing that answer." });
            }
            send({ t: "meta", meta });
            send({ t: "done" });
          }
        }
      } catch (err) {
        send({ t: "error", message: err instanceof Error ? err.message : "Something went wrong." });
        send({ t: "done" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
