/**
 * Thin extraction client over the Anthropic Messages API (@anthropic-ai/sdk).
 *
 * Extraction is a single-shot vision task per page, not an agentic loop, so this
 * uses the Messages API directly (the Agent SDK is for the M2 runtime). Sonnet
 * 4.6 is not in the structured-outputs support list, so we prompt for JSON and
 * validate with Zod + retry — model-agnostic and robust. Every call's usage is
 * priced locally via src/agent/pricing.ts (CLAUDE.md invariant #8).
 */

import { existsSync, readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { computeCostUsd } from "../../src/agent/cost";
import type { ModelId } from "../../src/agent/pricing";
import type { Usage } from "../../src/agent/telemetry";

/** Load .env into process.env if the key isn't already present (scripts aren't Next). */
export function loadEnv(): void {
  if (process.env.ANTHROPIC_API_KEY) return;
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export interface CostLedgerRow {
  model: ModelId;
  calls: number;
  usage: Usage;
  costUsd: number;
}

/** Running tally of what extraction spent, printed at the end of a run. */
export class CostLedger {
  private rows = new Map<ModelId, CostLedgerRow>();
  add(model: ModelId, u: Usage) {
    const row =
      this.rows.get(model) ??
      { model, calls: 0, usage: { tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0 }, costUsd: 0 };
    row.calls += 1;
    row.usage.tokensIn += u.tokensIn;
    row.usage.tokensOut += u.tokensOut;
    row.usage.cacheRead += u.cacheRead;
    row.usage.cacheWrite += u.cacheWrite;
    row.costUsd += computeCostUsd(model, u);
    this.rows.set(model, row);
  }
  total(): number {
    return [...this.rows.values()].reduce((s, r) => s + r.costUsd, 0);
  }
  print(): void {
    console.log("\n─ cost ────────────────────────────────");
    for (const r of this.rows.values()) {
      console.log(
        `  ${r.model.padEnd(18)} ${String(r.calls).padStart(3)} calls  ` +
          `in ${r.usage.tokensIn} out ${r.usage.tokensOut} ` +
          `cacheR ${r.usage.cacheRead} cacheW ${r.usage.cacheWrite}  $${r.costUsd.toFixed(4)}`,
      );
    }
    console.log(`  total: $${this.total().toFixed(4)}\n`);
  }
}

// Lazy so loadEnv() (called from main) populates ANTHROPIC_API_KEY before the
// client reads it — the client is only constructed on the first API call.
let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

function usageFrom(u: Anthropic.Usage): Usage {
  return {
    tokensIn: u.input_tokens ?? 0,
    tokensOut: u.output_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
  };
}

/** Strip ```json fences / surrounding prose to get at the JSON body. */
function unfence(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const first = text.search(/[[{]/);
  const last = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  return first >= 0 && last > first ? text.slice(first, last + 1) : text.trim();
}

export interface ExtractOpts {
  model: ModelId;
  system: string;
  content: Anthropic.ContentBlockParam[];
  /** Include the schema as JSON Schema in the prompt (helps conformance). */
  schemaHint?: boolean;
  maxTokens?: number;
  /** Enable adaptive thinking (use for the careful Opus verification pass). */
  think?: boolean;
  maxRetries?: number;
  ledger: CostLedger;
  label: string;
}

/**
 * Ask a model to emit a JSON value matching `schema`; parse, Zod-validate, and
 * retry with the validation error fed back on failure. Returns the typed value.
 */
export async function extractStructured<T>(schema: z.ZodType<T>, opts: ExtractOpts): Promise<T> {
  const { model, system, content, ledger, label } = opts;
  const maxRetries = opts.maxRetries ?? 2;
  const schemaBlock = opts.schemaHint
    ? `\n\nReturn a JSON value conforming to this JSON Schema:\n${JSON.stringify(z.toJSONSchema(schema))}`
    : "";

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [
        ...content,
        { type: "text", text: `Respond with ONLY the JSON value — no prose, no markdown fences.${schemaBlock}` },
      ],
    },
  ];

  let lastErr = "";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await client().messages.create({
      model,
      max_tokens: opts.maxTokens ?? 8192,
      system,
      ...(opts.think ? { thinking: { type: "adaptive" as const } } : {}),
      messages,
    });
    ledger.add(model, usageFrom(res.usage));

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    let parsed: unknown;
    try {
      parsed = JSON.parse(unfence(text));
    } catch (e) {
      lastErr = `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`;
      messages.push({ role: "assistant", content: text });
      messages.push({ role: "user", content: `${lastErr}. Return corrected JSON only.` });
      continue;
    }

    const check = schema.safeParse(parsed);
    if (check.success) return check.data;

    lastErr = check.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    messages.push({ role: "assistant", content: text });
    messages.push({ role: "user", content: `The JSON failed validation: ${lastErr}. Return corrected JSON only.` });
  }
  throw new Error(`extractStructured(${label}) failed after ${maxRetries + 1} attempts: ${lastErr}`);
}

export const textBlock = (text: string): Anthropic.TextBlockParam => ({ type: "text", text });
