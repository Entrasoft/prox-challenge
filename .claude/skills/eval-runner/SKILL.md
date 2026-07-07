---
name: eval-runner
description: How to run, extend, and interpret the eval battery. Consult whenever - finishing a milestone, adding or editing anything in evals/, building scripts/eval.ts, investigating a regression, or before claiming any accuracy number in the README or a commit message. "Done" claims without a fresh eval run are invalid.
---

# Eval runner

`npm run eval` → `scripts/eval.ts`:

1. Load `evals/questions.json`. For each entry, run the REAL agent (same
   module the route handler uses) with the question; capture full transcript
   including tool calls and emitted `<pxart>` blocks.
2. Grade with a judge call (Haiku 4.5 — cheap and sufficient) against:
   - `expected` (semantic match on values/pages, not string match),
   - `must_include_visual` → at least one pxart block of an appropriate type,
   - `must_clarify` → the FIRST agent turn is exactly one question,
   - citation present whenever a manual fact is asserted.
3. Multi-turn cases: when `must_clarify`, the harness answers with
   `clarify_reply` and grades the second turn as the answer.
4. Write `runs/<timestamp>.json` + a markdown summary (pass/fail per
   category, diffs vs previous run, and cost columns: mean and p95 cost
   per question, per category, plus overall cache hit rate — a falling
   hit rate means a cache breakpoint broke and costs just went ~10×).
   Exit non-zero on any regression or on
   pass-rate below the milestone's SPEC threshold.

## Rules

- Expected answers are filled in M3 **from the KB**, then human-verified at
  the checkpoint. Never fill `expected` from model knowledge.
- A failing eval is fixed by fixing the agent/KB, never by softening the
  question — exceptions require a note in `docs/decisions.md`.
- Keep judge prompts in `scripts/judge-rubric.md` so grading is reviewable.
- Cost: a full run is roughly a couple of dollars on Sonnet+Haiku with
  caching; run per milestone and per suspicious change, not per keystroke.
- When adding features, add at least one eval that would catch its
  regression (new component → a question that must invoke it).
