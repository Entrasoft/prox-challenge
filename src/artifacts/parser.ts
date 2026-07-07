/**
 * Stream parser — turns the agent's accumulated answer text into a sequence of
 * segments (markdown | artifact block | pending), by extracting <pxart> blocks.
 *
 * Re-run over the full accumulated text on each render (simple + correct for
 * answer-length text). Tolerance rules from the artifact-protocol skill:
 *  - a <pxart …> opened but not yet closed → `pending` (still streaming → skeleton)
 *  - a structurally malformed block → its raw text is emitted (never drop content)
 *  - text between/around blocks → markdown
 */

import {
  PXART_OPEN,
  PXART_CLOSE,
  type PxartBlock,
  type PxartType,
} from "./protocol";

export type Segment =
  | { kind: "md"; text: string }
  | { kind: "block"; block: PxartBlock }
  | { kind: "pending" };

const TYPES: PxartType[] = ["image-ref", "component", "svg", "react", "model"];

/** Find the index of the `>` that closes the opening tag starting at `start`, respecting quotes. -1 if incomplete. */
function findTagEnd(text: string, start: number): number {
  let quote: string | null = null;
  for (let i = start + PXART_OPEN.length; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ">") {
      return i;
    }
  }
  return -1;
}

/** Parse `key="value"` / `key='value'` attributes from an opening tag. */
function parseAttrs(openTag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([\w-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(openTag))) {
    attrs[m[1]] = m[3] !== undefined ? m[3] : (m[4] ?? "");
  }
  return attrs;
}

function buildBlock(attrs: Record<string, string>, inner: string | undefined): PxartBlock | null {
  const { id, type } = attrs;
  if (!id || !type || !TYPES.includes(type as PxartType)) return null;
  switch (type as PxartType) {
    case "image-ref":
      if (!attrs.figure) return null;
      return { kind: "image-ref", id, figure: attrs.figure, caption: attrs.caption };
    case "component": {
      if (!attrs.name) return null;
      let props: Record<string, unknown> | null = null;
      let propsError: string | undefined;
      if (attrs.props) {
        try {
          props = JSON.parse(attrs.props) as Record<string, unknown>;
        } catch (e) {
          propsError = e instanceof Error ? e.message : "invalid props JSON";
        }
      } else {
        props = {};
      }
      return { kind: "component", id, name: attrs.name, props, propsError };
    }
    case "svg":
      return { kind: "svg", id, title: attrs.title, svg: (inner ?? "").trim() };
    case "react":
      return { kind: "react", id, title: attrs.title, code: (inner ?? "").trim() };
    case "model": {
      let annotate: string[] | undefined;
      try {
        annotate = attrs.annotate ? (JSON.parse(attrs.annotate) as string[]) : undefined;
      } catch {
        annotate = undefined;
      }
      return { kind: "model", id, focus: attrs.focus, annotate, caption: attrs.caption };
    }
  }
}

export function parseSegments(text: string): Segment[] {
  const out: Segment[] = [];
  const pushMd = (s: string) => {
    if (!s) return;
    const last = out[out.length - 1];
    if (last && last.kind === "md") last.text += s;
    else out.push({ kind: "md", text: s });
  };

  let i = 0;
  while (i < text.length) {
    const start = text.indexOf(PXART_OPEN, i);
    if (start === -1) {
      pushMd(text.slice(i));
      break;
    }
    // The char after "<pxart" must be whitespace or the tag end — else it's just prose containing the string.
    const after = text[start + PXART_OPEN.length];
    if (after !== undefined && !/[\s/>]/.test(after)) {
      pushMd(text.slice(i, start + PXART_OPEN.length));
      i = start + PXART_OPEN.length;
      continue;
    }
    pushMd(text.slice(i, start));

    const tagEnd = findTagEnd(text, start);
    if (tagEnd === -1) {
      out.push({ kind: "pending" }); // opening tag still streaming
      return out;
    }
    const openTag = text.slice(start, tagEnd + 1);
    const selfClosing = /\/\s*>$/.test(openTag);
    const attrs = parseAttrs(openTag);

    if (selfClosing) {
      const block = buildBlock(attrs, undefined);
      if (block) out.push({ kind: "block", block });
      else pushMd(openTag);
      i = tagEnd + 1;
      continue;
    }

    // Container: find the closing </pxart>.
    const closeIdx = text.indexOf(PXART_CLOSE, tagEnd + 1);
    if (closeIdx === -1) {
      out.push({ kind: "pending" }); // inner content still streaming
      return out;
    }
    const inner = text.slice(tagEnd + 1, closeIdx);
    const block = buildBlock(attrs, inner);
    if (block) out.push({ kind: "block", block });
    else pushMd(text.slice(start, closeIdx + PXART_CLOSE.length));
    i = closeIdx + PXART_CLOSE.length;
  }
  return out;
}

/** True if the text contains at least one complete, valid block (used by evals/telemetry). */
export function hasBlock(text: string): boolean {
  return parseSegments(text).some((s) => s.kind === "block");
}
