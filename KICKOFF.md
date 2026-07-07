# KICKOFF — read me first, then build

You are building my submission to the Prox Founding Engineer Challenge in
this fork of `prox-technologies/prox-challenge`. The welder manual PDFs are
already in `files/`. Everything you need to know about *what* to build and
*how well* is written down:

1. Read `CLAUDE.md` (invariants and working agreements).
2. Read `SPEC.md` (graded axes, acceptance criteria, milestones M0–M6).
3. Skim the five skills under `.claude/skills/` so you know what exists —
   read each fully when its trigger applies.

Then execute the milestones **in order, starting with M0**. Do not skip the
two HUMAN CHECKPOINT gates (end of M1 and M3) — stop and ask me to verify.

## Standing instructions

- Enter plan mode and write the plan before coding M0, M2, and M4. For M1,
  M3, and M5, plan briefly inline and grind.
- End every milestone with `npm run check` and (from M3 on) `npm run eval`;
  paste the eval summary into the milestone commit message.
- Keep a running `docs/decisions.md` — one line per non-obvious choice with
  the reason. This seeds the README's design-decisions section.
- If an Agent SDK call fails or an API looks unfamiliar: stop, re-read
  `.claude/skills/agent-sdk/references/`, and if the answer isn't there,
  refresh the references from the live docs before guessing.
- Spend my money deliberately: Sonnet for extraction and runtime, Haiku for
  the eval judge, Opus 4.8 only for extraction spot-verification. Cache
  everything cacheable.
- Ask me only when: a decision is irreversible, it costs real money beyond
  the plan, or you hit a HUMAN CHECKPOINT.

## Definition of done

`SPEC.md` M6 exit criteria, plus: I can hand the repo URL and the
`omnipro.relightlabs.ai` link to a stranger and they see a page-cited,
diagram-drawing welding specialist inside two minutes.

Begin with Milestone 0.
