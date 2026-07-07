# Video walkthrough — script

Target length **~5 minutes**. Demo first (the product sells itself), architecture last.
Record on a phone-width viewport (or resize the browser to ~400px) so it reads like the real
use case: a DIYer at the machine. Each demo beat = one question, let the answer stream, point at
the visual.

---

## 0:00 – 0:25 · Hook

- **Show:** the empty chat on a phone-width screen — dark, one safety-orange dot, the three
  example chips.
- **Say:** "This is a specialist for one product — the Vulcan OmniPro 220 welder. Its manual is
  48 pages of duty-cycle tables, polarity procedures, and wiring diagrams. Nobody reads that
  standing in their garage. So I built the thing that did. It's grounded in the manual, cited to
  the page, and — the important part — it *draws*."

## 0:25 – 1:05 · Example #1 — a number, with a calculator *(challenge question)*

- **Type:** "What's the duty cycle for MIG welding at 200A on 240V?"
- **Point at:** the "Checking the duty-cycle chart…" status line → the answer **"25% @ 200A
  (owner manual p.7)"** → the **DutyCycleCalculator** that renders under it.
- **Do:** drag the amperage slider. "It didn't just quote a number — it pulled the rated points
  from the manual and it interpolates between them, and it *tells* you when it's interpolating.
  Drop to 115 amps and you're at 100% duty." Tap the cost chip: "**two and a half cents**, and it
  shows you."

## 1:05 – 1:45 · Example #2 — polarity, drawn unprompted *(challenge question)*

- **Type:** "What polarity setup do I need for TIG welding? Which socket does the ground clamp go
  in?"
- **Point at:** the **PolarityDiagram** — TIG torch to the negative socket, **ground clamp to the
  positive (red) socket**, DCEN badge — plus the real cable-setup figure from the quick-start guide.
- **Say:** "I never asked for a diagram. For a physical setup question, drawing it *is* the answer —
  red is positive, the ground clamp goes to the positive socket, and here's the manual's own photo,
  page-cited, click to zoom."

## 1:45 – 2:20 · Example #3 — a diagnosis *(challenge question)*

- **Type:** "I'm getting porosity in my flux-cored welds. What should I check?"
- **Point at:** the ordered checklist — **polarity first** (DCEN for self-shielded), then contact-tip
  distance, clean metal — each cited, plus the interactive troubleshooting flow.
- **Say:** "It leads with the most common cause and it knows *this* machine — self-shielded flux-core
  wants electrode-negative, which is the opposite of MIG."

## 2:20 – 2:55 · The ambiguous one — it asks, once

- **Type:** "What settings should I use for MIG?"
- **Point at:** it responds with **exactly one** question — "What metal, roughly how thick, and are
  you running the 0.030 wire it came with?" — not a form.
- **Reply:** "Mild steel, about 1/8 inch, 0.030 wire." → the full grounded answer with the synergic
  settings.
- **Say:** "Ambiguous question, one clarifying question, then it answers. And notice — this machine is
  *synergic*: you set wire size and thickness and it computes the rest, so the agent explains that
  instead of inventing a wire-speed number the manual never prints."

## 2:55 – 3:20 · The visual-only one

- **Type:** "Show me the front panel and what each control does."
- **Point at:** the **actual front-panel figure** cropped from page 8, with the caption + zoom.
- **Say:** "Some answers only exist as a picture in the manual — the panel, the wiring schematic, the
  weld-diagnosis photos. It finds the right figure and shows it."
- *(Optional: tap the mic and ask a question by voice; tap the speaker to hear an answer read back.)*

## 3:20 – 4:50 · Architecture (~90 seconds)

- **Show:** the README architecture diagram, then flick to `/dev/registry`, `kb/`, and a `runs/`
  report.
- **Say, walking the diagram:**
  - "One Next.js app. The React client and the Agent SDK loop are the same process."
  - "**Numbers never come from the model.** They're typed lookups in a committed knowledge base —
    every duty cycle and polarity returned with its page number. That's the KB-not-RAG call: a wrong
    amperage is worse than 'I don't know.'"
  - "The knowledge base is built by a pipeline — Ghostscript renders the pages, Sonnet extracts each
    into typed JSON, **Opus re-reads the critical tables cell-by-cell against the image**, and I
    signed off the duty-cycle and settings tables by hand against the PDF. `provenance.md` tracks it."
  - "The agent *draws* by emitting tagged blocks in its text stream — the same trick Claude's
    artifacts use. The client parses them and routes each to a renderer: the manual's own figure, one
    of four interactive components, a one-shot SVG, or **sandboxed React in an iframe** for anything
    novel."
  - "And it's all measured — `npm run eval` runs the real agent over 28 questions, grades them with a
    Haiku judge, and reports cost and cache hit rate. **100% answer-pass, ~three cents an answer.**"

## 4:50 – 5:10 · Close — the founding-engineer story

- **Say:** "The welder is one config. The extraction pipeline, the tools, the artifact protocol — none
  of it knows it's a welder. Point it at another manual and you get another specialist. That's the
  product: cost-per-deflected-support-question, measured, for anything that ships with a manual."
- **Show:** the session-cost ledger — the running total — and end.

---

### Shot list / assets
- Phone-width browser (or `/` resized ~400px) for all demo beats.
- Have the dev server warm (first request pays subprocess startup).
- `/dev/registry` for the component gallery b-roll.
- `runs/<latest>.md` and `docs/decisions.md` for the architecture segment.
