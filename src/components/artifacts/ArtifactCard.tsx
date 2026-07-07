"use client";

import type { ReactNode } from "react";
import type { Source } from "@/kb/schema";

const SOURCE_LABEL: Record<string, string> = {
  "owner-manual": "owner manual",
  "quick-start-guide": "quick-start guide",
  "selection-chart": "selection chart",
};

/** The card every artifact renders inside: subtle border, title, page-cite footer, 150ms fade. */
export function ArtifactCard({
  title,
  cite,
  children,
}: {
  title?: string;
  cite?: { page: number; source: Source } | null;
  children: ReactNode;
}) {
  return (
    <div className="artifact-card my-3 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      {title && (
        <div className="border-b border-[var(--color-border)] px-4 py-2 text-[13px] font-semibold text-[var(--color-muted)]">
          {title}
        </div>
      )}
      <div className="p-4">{children}</div>
      {cite && (
        <div className="border-t border-[var(--color-border)] px-4 py-1.5 text-[12px] text-[var(--color-faint)]">
          {SOURCE_LABEL[cite.source] ?? cite.source} · p.{cite.page}
        </div>
      )}
    </div>
  );
}

/** Visible error card for malformed/unknown artifacts — never a blank box or crash. */
export function ArtifactError({ message, detail }: { message: string; detail?: string }) {
  return (
    <div className="artifact-card my-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="text-[14px] font-semibold text-[var(--color-muted)]">Couldn&apos;t render that visual</div>
      <div className="mt-1 text-[13px] text-[var(--color-faint)]">{message}</div>
      {detail && (
        <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-[var(--color-surface-2)] p-2 text-[11px] text-[var(--color-faint)]">
          {detail}
        </pre>
      )}
    </div>
  );
}
