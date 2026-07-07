"use client";

import { useState } from "react";
import type { TroubleshootingFlowProps } from "./props";

export default function TroubleshootingFlow({ props }: { props: TroubleshootingFlowProps }) {
  const entry = props.entries[0];
  const [entryIdx, setEntryIdx] = useState(0);
  const [checked, setChecked] = useState<Set<number>>(new Set());

  if (!entry) {
    return <div className="text-[14px] text-[var(--color-muted)]">No matching troubleshooting entry.</div>;
  }
  const active = props.entries[entryIdx];
  const toggle = (i: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div>
      {props.entries.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2 text-[13px]">
          {props.entries.map((e, i) => (
            <button
              key={i}
              onClick={() => {
                setEntryIdx(i);
                setChecked(new Set());
              }}
              className={`rounded-lg border px-2.5 py-1 text-left ${
                i === entryIdx ? "border-[var(--color-accent)] text-white" : "border-[var(--color-border)] text-[var(--color-muted)]"
              }`}
            >
              {e.symptom.length > 42 ? e.symptom.slice(0, 40) + "…" : e.symptom}
            </button>
          ))}
        </div>
      )}

      <div className="mb-2 text-[15px] font-semibold text-white">{active.symptom}</div>
      <div className="mb-3 text-[13px] text-[var(--color-muted)]">
        Work down the list — most likely cause first. Tap each one as you rule it out.
      </div>

      <ol className="flex flex-col gap-2">
        {active.causes.map((c, i) => {
          const done = checked.has(i);
          return (
            <li key={i}>
              <button
                onClick={() => toggle(i)}
                className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                  done ? "border-[var(--color-border)] opacity-55" : "border-[var(--color-border)] hover:border-[var(--color-accent)]"
                }`}
              >
                <span
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[12px]"
                  style={{ borderColor: done ? "var(--color-accent)" : "var(--color-border)", background: done ? "var(--color-accent)" : "transparent", color: done ? "#000" : "transparent" }}
                >
                  ✓
                </span>
                <span className="min-w-0">
                  <span className={`text-[15px] ${done ? "line-through" : "text-white"}`}>{c.cause}</span>
                  <span className="mt-0.5 block text-[14px] text-[var(--color-muted)]">
                    {c.check}
                    {c.pageRef ? <span className="text-[var(--color-faint)]"> ({c.pageRef})</span> : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
