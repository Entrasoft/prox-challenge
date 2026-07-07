"use client";

import { useMemo } from "react";
import DOMPurify from "dompurify";
import type { SvgBlock } from "@/artifacts/protocol";

/** Render an agent-drawn SVG, sanitized (DOMPurify, SVG profile), constrained to width. */
export function SvgArtifact({ block }: { block: SvgBlock }) {
  // DOMPurify needs a window; compute on the client only (SSR yields "" — the chat
  // is client-rendered, and suppressHydrationWarning covers the /dev/registry SSR).
  const html = useMemo(
    () => (typeof window === "undefined" ? "" : DOMPurify.sanitize(block.svg, { USE_PROFILES: { svg: true, svgFilters: true } })),
    [block.svg],
  );
  return <div className="svg-artifact w-full" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />;
}
