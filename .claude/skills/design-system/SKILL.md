---
name: design-system
description: The visual and interaction bar for this app. Consult before creating or editing ANY page, component, layout, color, animation, loading state, or copy string — including registry components and the /dev/registry demo route. Also consult when a screen "works but looks default," which counts as failing the challenge's polish bar.
---

# Design system — built for a garage

The user is standing at a workbench: phone at arm's length, maybe gloves,
bad light (glare or dim). Every choice below follows from that.

## Tokens

- **Theme**: dark by default (garages are dim; welding areas are glarey),
  light theme available. High contrast throughout — WCAG AA minimum, AAA for
  body text.
- **Palette**: neutral slate scale + one safety-orange accent for primary
  actions and highlights. Semantic red/green reserved for polarity and
  pass/fail ONLY. Polarity convention everywhere (diagrams, chips, text):
  **red = positive (+/DCEP side), black/dark = negative (−)** — never remap.
- **Type**: system stack or Inter; body ≥ 16px, answer text 18px, generous
  line height. Numbers in tables/readouts use tabular figures.
- **Touch**: minimum 44×44px targets; primary actions thumb-reachable on
  mobile; no hover-only affordances.

## Layout

Single-column chat, max-width ~720px on desktop, full-bleed artifacts on
mobile. Artifacts get a card with a subtle border, title, and page-cite
footer; figure crops are click-to-zoom. Sticky input bar with mic button
(Web Speech) and a visible "listening" state.

## Motion & streaming

Text streams; artifacts mount with a 150ms fade — no layout jank (reserve
height from the parser's earliest signal). Skeleton for artifacts still
parsing. First visible token target < 1.5s perceived; if slower, show a
one-line status in the product voice ("Checking the duty-cycle chart…").

## States (every screen ships all four)

Loading, empty (first-run shows three example questions as tappable chips —
use the challenge's own three), error (plain words + retry, never a stack
trace), and offline/rate-limited (explain the demo cap politely).

## Cost chip (telemetry, SPEC §telemetry)

A quiet footer element on every answer: `$0.031 · 2.4s` in small muted
monospace with tabular figures. Tap/click expands a breakdown row — tokens
in/out, cache read/write, turns — same muted treatment. A session ledger
drawer (header icon) shows the running total and per-question list. Rules:
never shouty, never a toast, never interrupts reading; it should read like
a well-made multimeter — precise, calm, there when you look for it.

## Voice & microcopy

Competent friend at the next bench over. Plain words, short sentences, no
exclamation marks, no "simply." Safety warnings are one calm sentence with a
page cite. Clarifying questions are single and specific ("What metal and
roughly how thick?"), never a form.

## Definition of "polished" for this challenge

A reviewer should never see: default browser fonts, unstyled scrollbars in
artifact cards, layout shift during streaming, a text-only polarity answer,
or an artifact error that looks like a crash. Check this list before calling
M5 done.
