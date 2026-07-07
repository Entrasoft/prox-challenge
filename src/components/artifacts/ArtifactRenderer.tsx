"use client";

import type { PxartBlock } from "@/artifacts/protocol";
import type { Source } from "@/kb/schema";
import { ArtifactCard, ArtifactError } from "./ArtifactCard";
import { ImageRefArtifact } from "./ImageRefArtifact";
import { SvgArtifact } from "./SvgArtifact";
import { ComponentArtifact } from "./ComponentArtifact";
import { ReactArtifact } from "./ReactArtifact";

/** Pull a page cite from validated-ish component props (top-level, or first row). */
function citeFrom(props: Record<string, unknown> | null): { page: number; source: Source } | null {
  if (!props) return null;
  const p = props as Record<string, unknown>;
  if (typeof p.page === "number" && typeof p.source === "string") {
    return { page: p.page, source: p.source as Source };
  }
  const arr = (p.examples ?? p.entries) as Array<Record<string, unknown>> | undefined;
  const first = arr?.[0];
  if (first && typeof first.page === "number" && typeof first.source === "string") {
    return { page: first.page as number, source: first.source as Source };
  }
  return null;
}

export function ArtifactRenderer({ block }: { block: PxartBlock }) {
  switch (block.kind) {
    case "image-ref":
      return <ImageRefArtifact block={block} />;
    case "component":
      return (
        <ArtifactCard cite={citeFrom(block.props)}>
          <ComponentArtifact block={block} />
        </ArtifactCard>
      );
    case "svg":
      return (
        <ArtifactCard title={block.title}>
          <SvgArtifact block={block} />
        </ArtifactCard>
      );
    case "react":
      return (
        <ArtifactCard title={block.title ?? "Interactive"}>
          <ReactArtifact block={block} />
        </ArtifactCard>
      );
    case "model":
      return <ArtifactError message="A 3D model view is planned for a later milestone." />;
  }
}

/** Placeholder shown while a block is still streaming (parser returns `pending`). */
export function ArtifactSkeleton() {
  return (
    <div className="artifact-card my-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-center gap-2 text-[13px] text-[var(--color-faint)]">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent)]" />
        drawing…
      </div>
      <div className="mt-3 h-24 animate-pulse rounded-lg bg-[var(--color-surface-2)]" />
    </div>
  );
}
