/**
 * Artifact protocol — the single source of truth for multimodal output
 * (artifact-protocol skill). The agent emits typed <pxart> blocks inline in its
 * text stream; the client parses them out and routes each to a renderer.
 *
 * BOTH sides derive from this file so they cannot drift: `PROTOCOL_PROMPT` is
 * appended to the agent system prompt, and `src/artifacts/parser.ts` parses the
 * same grammar into these block types. Change the grammar here → update the
 * parser and the renderers in the same commit.
 */

export type PxartType = "image-ref" | "component" | "svg" | "react" | "model";

export interface ImageRefBlock {
  kind: "image-ref";
  id: string;
  figure: string;
  caption?: string;
}
export interface ComponentBlock {
  kind: "component";
  id: string;
  name: string;
  /** Parsed props (from single-quoted JSON); null if the JSON was unparseable. */
  props: Record<string, unknown> | null;
  propsError?: string;
}
export interface SvgBlock {
  kind: "svg";
  id: string;
  title?: string;
  svg: string;
}
export interface ReactBlock {
  kind: "react";
  id: string;
  title?: string;
  code: string;
}
export interface ModelBlock {
  kind: "model";
  id: string;
  focus?: string;
  annotate?: string[];
  caption?: string;
}
export type PxartBlock = ImageRefBlock | ComponentBlock | SvgBlock | ReactBlock | ModelBlock;

/** The registry component names the agent may reference in a `component` block. */
export const REGISTRY_COMPONENTS = [
  "DutyCycleCalculator",
  "PolarityDiagram",
  "SettingsConfigurator",
  "TroubleshootingFlow",
] as const;

export const PXART_OPEN = "<pxart";
export const PXART_CLOSE = "</pxart>";

/**
 * Appended to the agent system prompt at the M4 seam. Teaches the block grammar
 * and the policy from the artifact-protocol skill. Kept byte-stable for caching.
 */
export const PROTOCOL_PROMPT = `# Visuals — draw it, don't just describe it
You can render visuals by emitting typed <pxart> blocks inline in your answer. The app parses them out and renders them where they sit in your prose. When something is physical or spatial (polarity/socket hookup, wire feed, panel controls) or parametric (duty cycle, settings by material/thickness), SHOW it — a text-only answer to a physical-setup question is a bug.

## Block grammar
Self-closing:
<pxart id="a1" type="image-ref" figure="fig-p8-front-panel-controls-diagram" caption="Front panel controls, owner manual p.8"/>
<pxart id="a2" type="component" name="DutyCycleCalculator" props='{"process":"MIG","inputVoltage":240}'/>
Container:
<pxart id="a3" type="svg" title="TIG polarity hookup"><svg viewBox="0 0 640 360">…</svg></pxart>
<pxart id="a4" type="react" title="Bevel-angle explorer">export default function Art(){ return <div style={{color:'#eef2f6'}}>…</div> }</pxart>

Rules: id is unique per answer; type ∈ image-ref | component | svg | react. props is JSON in SINGLE quotes. Nothing else in the tag.

## Which block to use (prefer in this order)
1. image-ref — the manual already shows it. Find the figure id with get_figure, then reference it. Best for "show me / where is" and any answer that maps to a real manual figure (panel, wire feed, weld-diagnosis photos, wiring schematic, the process-selection chart).
2. component — a registry component fits: DutyCycleCalculator (duty cycle by process+voltage), PolarityDiagram (polarity/socket hookup by process), SettingsConfigurator (settings by process+material+thickness), TroubleshootingFlow (symptom → causes/checks). For a component block you MUST first call get_registry_props with the component name and the user's parameters, then embed the returned props object verbatim as the props attribute. Never hand-author props containing manual data.
3. svg — a one-shot diagram the manual doesn't have and no component fits. Self-contained <svg> with a viewBox. Use the polarity color convention: red = positive (+ / DCEP side), dark = negative (−).
4. react — only for novel interactivity nothing above covers. Self-contained: a default-exported, props-free component; no imports (React is in scope), no network, no storage; use inline styles (Tailwind is not available in the sandbox).

## Policy
- Physical-setup answers MUST include at least one block. Parametric questions SHOULD use the matching component.
- One or two blocks per answer unless asked for more. Put each block at the point in your prose where you discuss it, not appended at the end.
- The block renders the visual — don't also paste the same data as a big text table; a short lead-in sentence plus the block is enough.`;
