---
name: artifact-protocol
description: The single source of truth for multimodal output. Consult whenever touching ANY of - the agent's system prompt sections about visuals, the client stream parser, the artifact sandbox/iframe, registry components, SVG rendering, figure display, or when an artifact renders wrong, gets truncated, or the agent describes a diagram instead of drawing one. Both the agent prompt and the client parser MUST be generated from this spec so they cannot drift.
---

# Artifact protocol

The agent speaks visuals by emitting typed blocks inline in its text stream
(the same trick Claude.ai's artifacts use: tagged blocks parsed out of the
response and routed to renderers). Grammar, agent policy, and client
contract follow. Change any of them → update the other two in the same
commit.

## Block grammar (agent output)

Self-closing, reference-style:

```
<pxart id="a1" type="image-ref" figure="fig-p12-wire-feed" caption="Wire feed tensioner, manual p.12"/>
<pxart id="a2" type="component" name="DutyCycleCalculator" props='{"process":"MIG","inputVoltage":240}'/>
```

Container-style:

```
<pxart id="a3" type="svg" title="TIG polarity hookup">
  <svg viewBox="0 0 640 360">…</svg>
</pxart>
<pxart id="a4" type="react" title="Custom bevel-angle explorer">
  …self-contained TSX, default export, props-free…
</pxart>
```

Reserved for M7 (do not emit before the viewer exists):

```
<pxart id="a5" type="model" focus="socket-neg" annotate='["socket-neg","socket-pos"]' caption="TIG hookup, manual p.N"/>
```

Attributes: `id` unique per response; `type` ∈ image-ref | svg | component |
react | model; `props` is JSON in single quotes; `focus`/`annotate` (model
only) name partIds from `kb/model/annotations.json`. Nothing else.

## Agent policy (goes in the system prompt, derived from here)

1. Prefer, in order: **image-ref** (the manual already shows it) →
   **component** (a registry component fits) → **svg** (one-shot diagram) →
   **react** (novel interactivity only).
2. Physical-setup answers MUST include at least one block. Complex parametric
   questions (duty cycle, settings by material/thickness) SHOULD use the
   matching registry component.
3. For `component` blocks, first call the `get_registry_props` tool with the
   component name and the user's parameters; embed the returned props
   verbatim. Never hand-author props containing manual data.
4. One or two blocks per answer unless the user asks for more. Blocks sit at
   the point in the prose where they're discussed, not appended at the end.
5. Free-form `react` must be self-contained: no imports beyond React, no
   network, no storage; assume Tailwind classes are available.

## Client contract

- **Stream parser**: incremental state machine over the token stream;
  tolerant of a tag split across chunks; on malformed block, render the raw
  text (never drop content). Text outside blocks renders as markdown.
- **image-ref**: resolve `figure` against `kb/figures/index.json`, serve the
  crop from `/kb/figures/img/`, caption + "manual p.N" link under it,
  click-to-zoom.
- **svg**: sanitize, render inline, constrain to container width.
- **component**: look up in `src/components/registry/index.ts` (a typed map
  name → component). Registry components are pure-props, fetch nothing, and
  validate props with zod — bad props render a visible error card, not a
  crash.
- **model** (M7): mount the shared 3D viewer with the GLB from
  `kb/model/`, apply `focus` camera preset and pulse-highlight `annotate`
  parts from `kb/model/annotations.json`; AR button hands off to the
  platform-native AR path. Before M7 ships, an emitted `model` block
  degrades to the nearest `image-ref` for the same part.
- **react**: render in a sandboxed same-page iframe (`srcdoc`, no network,
  `sandbox="allow-scripts"`), compile with a client-side transformer
  (Babel standalone or react-runner style), postMessage for height. Error
  boundary shows the code with a "view source" toggle instead of a blank box.

## Registry components (M4 deliverables)

`DutyCycleCalculator` (process + input voltage → chart + safe-runtime
readout, interpolation labeled as interpolation), `PolarityDiagram`
(process → socket/cable hookup with +/− color convention from the
design-system skill), `SettingsConfigurator` (process + material + thickness
→ wire/tungsten, wire speed, voltage from `kb/tables/synergic-settings.json`),
`TroubleshootingFlow` (symptom → interactive decision tree from
`kb/tables/troubleshooting.json`). Each ships with a Storybook-less demo
route at `/dev/registry` for eyeballing.
