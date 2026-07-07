/**
 * npm run eval — run the eval battery against the REAL agent and grade it.
 *
 * For each question in evals/questions.json:
 *   1. Run the same agent the chat route uses (src/agent/agent.ts). For ambiguous
 *      questions, the first turn should be a clarifying question; the harness then
 *      answers with `clarify_reply` (resuming the session) and grades turn 2.
 *   2. Grade with a Haiku judge (scripts/judge-rubric.md) on `expected` (semantic),
 *      citation presence, and — for ambiguous — clarify-first. Visual coverage
 *      (`must_include_visual`) is checked deterministically from emitted <pxart>
 *      blocks; it is ~0 until M4 emits visuals.
 *   3. Write runs/<ts>.json + a markdown summary with per-category pass rates and
 *      cost (mean/p95) + cache-hit-rate; diff vs the previous run; exit non-zero on
 *      regression or below the answer-pass threshold.
 *
 * "Expected" answers are filled FROM THE KB and human-verified (eval-runner skill);
 * a failing eval is fixed by fixing the agent/KB, never by softening the question.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { runAgent, resultToMeta } from "../src/agent/agent";
import { JUDGE_MODEL } from "../src/agent/pricing";
import type { ResponseMeta } from "../src/agent/telemetry";
import { CostLedger, extractStructured, loadEnv, textBlock } from "./lib/model";

const RUNS_DIR = "runs";
const ANSWER_PASS_THRESHOLD = 0.85; // M3 baseline gate on the criteria M2 delivers

const Question = z.object({
  id: z.string(),
  category: z.string(),
  question: z.string(),
  expected: z.string(),
  verify_pages: z.array(z.number()).nullable(),
  must_include_visual: z.boolean(),
  must_clarify: z.boolean(),
  clarify_reply: z.string().optional(),
});
type Question = z.infer<typeof Question>;

const JudgeVerdict = z.object({
  correct: z.boolean(),
  citationOk: z.boolean(),
  clarifyOk: z.boolean(),
  reasoning: z.string(),
});

interface TurnResult {
  text: string;
  tools: string[];
  pxartCount: number;
  meta: ResponseMeta | null;
  subtype: string;
}

interface QResult {
  id: string;
  category: string;
  question: string;
  firstTurn: string;
  answer: string;
  tools: string[];
  correct: boolean;
  citationOk: boolean;
  clarifyOk: boolean;
  visualOk: boolean;
  answerPass: boolean;
  fullPass: boolean;
  reasoning: string;
  costUsd: number;
  usage: ResponseMeta["usage"] | null;
}

const ledger = new CostLedger();
const RUBRIC = readFileSync("scripts/judge-rubric.md", "utf8");

/** Iterate one agent turn to completion, collecting answer text, tools, and telemetry. */
async function collectTurn(prompt: string, resume?: string): Promise<TurnResult> {
  let text = "";
  const tools: string[] = [];
  let meta: ResponseMeta | null = null;
  let subtype = "";
  for await (const msg of runAgent({ prompt, resume })) {
    if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "text") text += block.text;
        else if (block.type === "tool_use") tools.push(block.name.replace(/^mcp__omnipro__/, ""));
      }
    } else if (msg.type === "result") {
      meta = resultToMeta(msg);
      subtype = msg.subtype;
    }
  }
  const pxartCount = (text.match(/<pxart\b/g) ?? []).length;
  return { text: text.trim(), tools, pxartCount, meta, subtype };
}

async function runQuestion(q: Question): Promise<QResult> {
  const t1 = await collectTurn(q.question);
  let answer = t1;
  if (q.must_clarify && q.clarify_reply && t1.meta?.sessionId) {
    answer = await collectTurn(q.clarify_reply, t1.meta.sessionId);
  }

  const verdict = await extractStructured(JudgeVerdict, {
    model: JUDGE_MODEL,
    ledger,
    label: `judge ${q.id}`,
    schemaHint: true,
    system: RUBRIC,
    content: [
      textBlock(
        JSON.stringify({
          question: q.question,
          category: q.category,
          expected: q.expected,
          answer: answer.text,
          firstTurn: q.must_clarify ? t1.text : null,
        }),
      ),
    ],
  });

  const visualOk = answer.pxartCount > 0;
  const clarifyOk = q.must_clarify ? verdict.clarifyOk : true;
  const answerPass = verdict.correct && verdict.citationOk && clarifyOk;
  const fullPass = answerPass && (q.must_include_visual ? visualOk : true);
  const costUsd = (t1.meta?.costUsd ?? 0) + (answer !== t1 ? (answer.meta?.costUsd ?? 0) : 0);

  return {
    id: q.id,
    category: q.category,
    question: q.question,
    firstTurn: t1.text,
    answer: answer.text,
    tools: [...new Set([...t1.tools, ...(answer !== t1 ? answer.tools : [])])],
    correct: verdict.correct,
    citationOk: verdict.citationOk,
    clarifyOk,
    visualOk,
    answerPass,
    fullPass,
    reasoning: verdict.reasoning,
    costUsd,
    usage: answer.meta?.usage ?? t1.meta?.usage ?? null,
  };
}

// ── aggregation + reporting ───────────────────────────────────────────────────
function pct(n: number, d: number) {
  return d === 0 ? 0 : Math.round((n / d) * 1000) / 10;
}
function p95(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)];
}

function previousRun(): { answerPassById: Record<string, boolean>; answerPassRate: number } | null {
  try {
    const files = readdirSync(RUNS_DIR).filter((f) => f.endsWith(".json")).sort();
    if (!files.length) return null;
    const prev = JSON.parse(readFileSync(path.join(RUNS_DIR, files[files.length - 1]), "utf8"));
    const map: Record<string, boolean> = {};
    for (const r of prev.results ?? []) map[r.id] = r.answerPass;
    return { answerPassById: map, answerPassRate: prev.summary?.answerPassRate ?? 0 };
  } catch {
    return null;
  }
}

async function main() {
  loadEnv();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set. Put it in .env and retry.");
    process.exit(1);
  }
  mkdirSync(RUNS_DIR, { recursive: true });

  const raw = JSON.parse(readFileSync("evals/questions.json", "utf8"));
  const questions = z.array(Question).parse(raw.questions);
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const only = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",")) : null;
  const selected = only ? questions.filter((q) => only.has(q.id) || only.has(q.category)) : questions;

  console.log(`running ${selected.length} evals against the agent…\n`);
  const results: QResult[] = [];
  for (const q of selected) {
    const r = await runQuestion(q);
    results.push(r);
    const flag = r.answerPass ? "PASS" : "FAIL";
    console.log(
      `  ${flag} ${r.id} [${r.category}] correct=${r.correct} cite=${r.citationOk}` +
        `${q.must_clarify ? ` clarify=${r.clarifyOk}` : ""}${q.must_include_visual ? ` visual=${r.visualOk}` : ""}` +
        ` $${r.costUsd.toFixed(4)}${r.answerPass ? "" : `  — ${r.reasoning}`}`,
    );
  }

  // Aggregates
  const cats = [...new Set(results.map((r) => r.category))];
  const answerPass = results.filter((r) => r.answerPass).length;
  const fullPass = results.filter((r) => r.fullPass).length;
  const visualNeeded = results.filter((r) => selected.find((q) => q.id === r.id)!.must_include_visual);
  const visualCovered = visualNeeded.filter((r) => r.visualOk).length;
  const agentCost = results.reduce((s, r) => s + r.costUsd, 0);
  const usages = results.map((r) => r.usage).filter(Boolean) as ResponseMeta["usage"][];
  const cacheRead = usages.reduce((s, u) => s + u.cacheRead, 0);
  const cacheDenom = usages.reduce((s, u) => s + u.cacheRead + u.cacheWrite + u.tokensIn, 0);

  const perCategory = cats.map((c) => {
    const rs = results.filter((r) => r.category === c);
    return {
      category: c,
      answerPass: `${rs.filter((r) => r.answerPass).length}/${rs.length}`,
      meanCost: rs.reduce((s, r) => s + r.costUsd, 0) / rs.length,
    };
  });

  const summary = {
    answerPassRate: pct(answerPass, results.length),
    fullPassRate: pct(fullPass, results.length),
    visualCoverage: `${visualCovered}/${visualNeeded.length}`,
    meanCostUsd: agentCost / results.length,
    p95CostUsd: p95(results.map((r) => r.costUsd)),
    agentCostUsd: agentCost,
    judgeCostUsd: ledger.total(),
    cacheHitRate: pct(cacheRead, cacheDenom),
  };

  const prev = previousRun();
  // Per-question flips are informational: the agent is non-deterministic, so 1–2 questions
  // flip pass↔fail run to run. The gate is on the AGGREGATE pass-rate (absolute threshold +
  // a tolerance band vs the previous run), which catches a real regression without
  // false-alarming on single-question flakiness (eval-runner rule; documented in decisions).
  const flipped = prev
    ? results.filter((r) => prev.answerPassById[r.id] === true && !r.answerPass).map((r) => r.id)
    : [];

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(path.join(RUNS_DIR, `${ts}.json`), JSON.stringify({ ts, summary, perCategory, results }, null, 2));
  writeFileSync(path.join(RUNS_DIR, `${ts}.md`), renderMarkdown(ts, summary, perCategory, results, flipped));

  console.log(`\n─ summary ──────────────────────────────`);
  console.log(`  answer-pass: ${summary.answerPassRate}%  (correct + citation + clarify)`);
  console.log(`  full-pass:   ${summary.fullPassRate}%  (+ visual — visuals land in M4)`);
  console.log(`  visual coverage: ${summary.visualCoverage} (M4)`);
  console.log(`  cost: mean $${summary.meanCostUsd.toFixed(4)} · p95 $${summary.p95CostUsd.toFixed(4)} · agent $${agentCost.toFixed(3)} + judge $${ledger.total().toFixed(3)}`);
  console.log(`  cache hit rate: ${summary.cacheHitRate}%`);
  console.log(`  report: runs/${ts}.md`);
  if (flipped.length) console.log(`  flipped since last run (informational): ${flipped.join(", ")}`);

  const REGRESSION_TOLERANCE = 5; // percentage points — absorb single-question LLM flakiness
  const belowThreshold = summary.answerPassRate < ANSWER_PASS_THRESHOLD * 100;
  const aggregateRegression = prev !== null && summary.answerPassRate < prev.answerPassRate - REGRESSION_TOLERANCE;
  if (belowThreshold || aggregateRegression) {
    console.error(
      `\nFAIL: ${
        belowThreshold
          ? `answer-pass ${summary.answerPassRate}% < ${ANSWER_PASS_THRESHOLD * 100}% threshold`
          : `answer-pass ${summary.answerPassRate}% dropped >${REGRESSION_TOLERANCE}pts vs previous ${prev?.answerPassRate}%`
      }`,
    );
    process.exit(1);
  }
}

function renderMarkdown(
  ts: string,
  summary: Record<string, unknown>,
  perCategory: { category: string; answerPass: string; meanCost: number }[],
  results: QResult[],
  flipped: string[],
): string {
  const L: string[] = [];
  L.push(`# Eval run — ${ts}`, "");
  L.push(`- **Answer-pass** (correct + citation + clarify): **${summary.answerPassRate}%**`);
  L.push(`- **Full-pass** (+ visual): ${summary.fullPassRate}%`);
  L.push(`- **Visual coverage**: ${summary.visualCoverage}`);
  L.push(`- **Cost**: mean $${(summary.meanCostUsd as number).toFixed(4)} · p95 $${(summary.p95CostUsd as number).toFixed(4)} · agent $${(summary.agentCostUsd as number).toFixed(3)} + judge $${(summary.judgeCostUsd as number).toFixed(3)}`);
  L.push(`- **Cache hit rate**: ${summary.cacheHitRate}%`);
  if (flipped.length) L.push(`- **Flipped since last run** (informational — LLM non-determinism): ${flipped.join(", ")}`);
  L.push("", "## Per category", "", "| Category | Answer-pass | Mean cost |", "| --- | --- | --- |");
  for (const c of perCategory) L.push(`| ${c.category} | ${c.answerPass} | $${c.meanCost.toFixed(4)} |`);
  L.push("", "## Per question", "", "| ID | Cat | Pass | correct | cite | clarify | visual | tools | $ |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const r of results) {
    L.push(
      `| ${r.id} | ${r.category} | ${r.answerPass ? "✅" : "❌"} | ${r.correct ? "y" : "n"} | ${r.citationOk ? "y" : "n"} | ${r.clarifyOk ? "y" : "-"} | ${r.visualOk ? "y" : "·"} | ${r.tools.join(",") || "-"} | ${r.costUsd.toFixed(4)} |`,
    );
  }
  L.push("", "## Misses", "");
  const misses = results.filter((r) => !r.answerPass);
  if (!misses.length) L.push("_none_");
  for (const r of misses) L.push(`- **${r.id}**: ${r.reasoning}`);
  L.push("");
  return L.join("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
