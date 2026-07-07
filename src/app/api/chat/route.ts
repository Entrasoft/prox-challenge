/**
 * Chat endpoint — the real streaming plumbing, end to end.
 *
 * M0: the reply is a hardcoded canned answer streamed token-by-token as NDJSON,
 * followed by one `meta` event carrying usage/cost in the real telemetry shape.
 * M2 replaces `cannedAnswer()` with the Agent SDK `query()` loop; the transport,
 * the event grammar, and the cost path stay exactly as they are here, so nothing
 * downstream (the client parser, the cost chip) has to change.
 */

import { computeCostUsd } from "@/agent/cost";
import { DEFAULT_MODEL } from "@/agent/pricing";
import type { ChatStreamEvent, ResponseMeta, Usage } from "@/agent/telemetry";

// The Agent SDK (M2) runs a subprocess, so this route must be the Node.js runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CANNED_ANSWER = [
  "I'm the OmniPro 220 specialist — still being wired up.",
  "",
  "Right now this is a plumbing check: the answer you're reading streamed from",
  "the server token-by-token over the same channel the real agent will use, and",
  "the footer below carries real usage and cost telemetry (placeholder numbers",
  "until Milestone 2 connects the Claude Agent SDK).",
  "",
  "Once the knowledge base is extracted, ask me about duty cycles, polarity",
  "setup, wire tension, or a weld that's misbehaving — and I'll answer with the",
  "manual page and a diagram, not a wall of text.",
].join(" ");

/** Split text into small word-ish chunks so it streams like real tokens. */
function tokenize(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [text];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request): Promise<Response> {
  // The user's message isn't used yet (canned reply); parse it so the contract
  // with the client is already correct for M2.
  await req.json().catch(() => ({ message: "" }));

  const startedAt = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatStreamEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));

      try {
        for (const chunk of tokenize(CANNED_ANSWER)) {
          send({ t: "delta", v: chunk });
          await sleep(18);
        }

        // Placeholder usage in the real shape. In M2 these come from the SDK
        // result message's usage accounting; the cost is always computed by us.
        const usage: Usage = { tokensIn: 1200, tokensOut: 320, cacheRead: 5400, cacheWrite: 1500 };
        const meta: ResponseMeta = {
          model: DEFAULT_MODEL,
          usage,
          costUsd: computeCostUsd(DEFAULT_MODEL, usage),
          turns: 1,
          latencyMs: Date.now() - startedAt,
        };
        send({ t: "meta", meta });
        send({ t: "done" });
      } catch (err) {
        send({ t: "error", message: err instanceof Error ? err.message : "Something went wrong." });
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
