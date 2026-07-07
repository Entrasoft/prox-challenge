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

// The Agent SDK spawns a subprocess — Node.js runtime, no static optimization.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Append one usage record per request for the README cost table + eval health (SPEC §telemetry). */
function logUsage(meta: ResponseMeta) {
  try {
    const dir = path.join(process.cwd(), "var");
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
  const body = (await req.json().catch(() => ({}))) as { message?: string; sessionId?: string };
  const message = (body.message ?? "").trim();
  if (!message) {
    return new Response(JSON.stringify({ error: "empty message" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

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
