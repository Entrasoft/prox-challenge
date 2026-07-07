---
name: omnipro-knowledge
description: The knowledge base contract for the Vulcan OmniPro 220. Consult whenever - building or modifying the extraction pipeline, defining or reading anything in kb/, writing agent tools that touch manual data, writing the agent system prompt's domain/safety sections, or answering any question about welding terminology, polarity, duty cycle, or synergic settings. Also consult before filling eval expected-answers.
---

# OmniPro 220 knowledge base

## Layout (committed to the repo — reviewers never run extraction)

```
kb/
├── tables/
│   ├── duty-cycle.json          # per process × input voltage
│   ├── synergic-settings.json   # process × wire/electrode × material × thickness
│   ├── troubleshooting.json     # symptom → causes[] → checks[] (decision tree)
│   └── specs.json               # ratings, breaker requirements, consumables
├── figures/
│   ├── index.json               # id, page, caption, tags[], path
│   └── img/fig-*.png            # tight crops at readable resolution
├── chunks.jsonl                 # {text, page, section} for search_manual
└── provenance.md                # file → source pages → verification status
```

Schema examples:

```json
// duty-cycle.json entry
{"process":"MIG","inputVoltage":240,
 "points":[{"amps":90,"dutyPct":60},{"amps":200,"dutyPct":25}],
 "page":9,"notes":"10-minute cycle basis"}

// figures/index.json entry
{"id":"fig-p12-wire-feed","page":12,"caption":"Wire drive and tensioner",
 "tags":["wire-feed","tensioner","MIG","flux-core"],
 "path":"figures/img/fig-p12-wire-feed.png"}
```

## Extraction procedure (M1)

1. Render each PDF page to an image; run a typed-extraction pass per page
   (Sonnet, vision) emitting JSON matching the schemas above plus text
   chunks with page anchors.
2. **Verification pass**: for every table file, re-present the source page
   image alongside the freshly written JSON and check cell-by-cell; log
   result in `provenance.md`. Use Opus 4.8 here for the four critical
   artifacts: duty-cycle data, process selection chart, wiring schematic,
   weld diagnosis photos.
3. Figure crops: detect labeled figures, crop tight, caption from the
   manual's own caption text, tag generously (tags drive `get_figure`).
4. STOP at the human checkpoint: the user verifies duty-cycle and
   synergic-settings JSON against the PDF before M2 begins.

## Domain conventions (for prompts, tools, and evals)

- **DCEP** = DC electrode positive (torch/gun to +). **DCEN** = electrode
  negative. Which process uses which **must be read off the manual's
  polarity pages for THIS machine** — solid-wire MIG, gas-shielded
  flux-core, self-shielded flux-core, TIG, and stick differ, and the socket
  labeling in the manual is authoritative. Do not import priors; do not let
  the model answer polarity without a `lookup_table`/`get_figure` hit.
- **Duty cycle** = % of a 10-minute window at a given output before thermal
  protection; always state the basis and the input voltage it was rated at.
- **Synergic mode** = the machine derives wire speed/voltage from a selected
  program; settings answers must say whether a value is a synergic program
  input or a manual override.
- Ambiguity defaults: "what settings for MIG?" lacks material + thickness +
  wire — ask ONE question that gathers the missing dimensions together.

## Safety rules (non-negotiable, mirror into the agent system prompt)

- Carry the manual's own warnings when an answer touches shock, fumes, fire,
  or eye protection — one tight sentence plus the page cite, not a lecture.
- Never advise defeating thermal/duty-cycle protection or opening the case;
  internal faults route to qualified service per the manual.
- Galvanized/coated/painted metal → zinc-fume warning before technique.
- If the user describes an active hazard (tripping breaker mid-weld, burning
  smell, shock), lead with stop-and-make-safe, then diagnose.
