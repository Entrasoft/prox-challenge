"use client";

import { useEffect, useState } from "react";
import type { ImageRefBlock } from "@/artifacts/protocol";
import type { Source } from "@/kb/schema";
import { ArtifactError } from "./ArtifactCard";

type FigMeta = { id: string; caption: string; page: number; source: Source; kind: string };

// Module-level cache so the figure index is fetched once for the whole session.
let cache: FigMeta[] | null = null;
let inflight: Promise<FigMeta[]> | null = null;
function loadFigures(): Promise<FigMeta[]> {
  if (cache) return Promise.resolve(cache);
  if (!inflight)
    inflight = fetch("/api/figures")
      .then((r) => r.json())
      .then((d: { figures: FigMeta[] }) => (cache = d.figures));
  return inflight;
}

export function ImageRefArtifact({ block }: { block: ImageRefBlock }) {
  const [meta, setMeta] = useState<FigMeta | null>(null);
  const [broken, setBroken] = useState(false);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    let live = true;
    loadFigures().then((figs) => {
      if (live) setMeta(figs.find((f) => f.id === block.figure) ?? null);
    });
    return () => {
      live = false;
    };
  }, [block.figure]);

  if (broken) {
    return <ArtifactError message={`figure "${block.figure}" isn't in the manual index.`} />;
  }

  const src = `/api/figure/${encodeURIComponent(block.figure)}`;
  const caption = block.caption ?? meta?.caption ?? "";

  return (
    <figure className="artifact-card my-3 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <button
        onClick={() => setZoom(true)}
        className="block w-full cursor-zoom-in bg-white"
        aria-label="zoom figure"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={caption || "manual figure"} className="mx-auto max-h-[420px] w-auto max-w-full" onError={() => setBroken(true)} />
      </button>
      {(caption || meta) && (
        <figcaption className="border-t border-[var(--color-border)] px-4 py-2 text-[13px] text-[var(--color-muted)]">
          {caption}
          {/* Append the page cite only if the agent's caption doesn't already carry one. */}
          {meta && !/p\.?\s*\d/i.test(caption) && (
            <span className="text-[var(--color-faint)]">
              {" "}
              · {meta.source === "owner-manual" ? "owner manual" : meta.source} p.{meta.page}
            </span>
          )}
        </figcaption>
      )}

      {zoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setZoom(false)}
          role="dialog"
          aria-modal="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={caption || "manual figure"} className="max-h-full max-w-full rounded-lg bg-white" />
        </div>
      )}
    </figure>
  );
}
