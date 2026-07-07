"use client";

import { useMemo, useState } from "react";
import type { DutyCycleCalculatorProps } from "./props";

const ACCENT = "#ff6a1a";

function dutyAt(points: { amps: number; dutyPct: number }[], amps: number) {
  const pts = [...points].sort((a, b) => a.amps - b.amps);
  if (amps <= pts[0].amps) return { pct: pts[0].dutyPct, interpolated: false };
  const last = pts[pts.length - 1];
  if (amps >= last.amps) return { pct: last.dutyPct, interpolated: false };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (amps >= a.amps && amps <= b.amps) {
      const t = (amps - a.amps) / (b.amps - a.amps);
      const exact = amps === a.amps || amps === b.amps;
      return { pct: Math.round(a.dutyPct + t * (b.dutyPct - a.dutyPct)), interpolated: !exact };
    }
  }
  return { pct: last.dutyPct, interpolated: false };
}

const fmt = (min: number) => {
  const s = Math.round(min * 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function DutyCycleCalculator({ props }: { props: DutyCycleCalculatorProps }) {
  const voltages = props.entries.map((e) => e.inputVoltage);
  const [voltage, setVoltage] = useState(voltages[voltages.length - 1] ?? 240);
  const entry = props.entries.find((e) => e.inputVoltage === voltage) ?? props.entries[0];
  const range = props.weldingCurrentRange.find((r) => r.inputVoltage === voltage);
  const pts = [...entry.points].sort((a, b) => a.amps - b.amps);
  const min = range?.minAmps ?? pts[0].amps;
  const max = range?.maxAmps ?? pts[pts.length - 1].amps;
  const [amps, setAmps] = useState(Math.min(max, pts[pts.length - 1].amps));

  const duty = useMemo(() => dutyAt(entry.points, amps), [entry, amps]);
  const weldMin = (duty.pct / 100) * 10;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-[15px] font-semibold">{props.process} duty cycle</div>
        {voltages.length > 1 && (
          <div className="flex overflow-hidden rounded-lg border border-[var(--color-border)] text-[13px]">
            {voltages.map((v) => (
              <button
                key={v}
                onClick={() => {
                  setVoltage(v);
                  const r = props.weldingCurrentRange.find((x) => x.inputVoltage === v);
                  if (r) setAmps((a) => Math.min(r.maxAmps, Math.max(r.minAmps, a)));
                }}
                className={`tabular px-3 py-1 ${v === voltage ? "text-black" : "text-[var(--color-muted)]"}`}
                style={{ background: v === voltage ? ACCENT : "transparent" }}
              >
                {v}V
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
        <div className="flex items-end justify-between">
          <div>
            <div className="tabular text-[40px] font-bold leading-none" style={{ color: ACCENT }}>
              {duty.pct}%
            </div>
            <div className="mt-1 text-[13px] text-[var(--color-muted)]">
              duty cycle at <span className="tabular">{amps}A</span>
              {duty.interpolated && (
                <span className="ml-2 rounded bg-[var(--color-surface)] px-1.5 py-0.5 text-[11px] text-[var(--color-faint)]">
                  interpolated
                </span>
              )}
            </div>
          </div>
          <div className="tabular text-right text-[13px] text-[var(--color-muted)]">
            <div>
              weld <span className="text-white">{fmt(weldMin)}</span>
            </div>
            <div>
              rest <span className="text-white">{fmt(10 - weldMin)}</span>
            </div>
            <div className="text-[11px] text-[var(--color-faint)]">per 10 min</div>
          </div>
        </div>

        <input
          type="range"
          min={min}
          max={max}
          value={amps}
          onChange={(e) => setAmps(Number(e.target.value))}
          className="mt-4 w-full accent-[var(--color-accent)]"
          aria-label="welding current (amps)"
        />
        <div className="tabular mt-1 flex justify-between text-[11px] text-[var(--color-faint)]">
          <span>{min}A</span>
          <span>{max}A</span>
        </div>
      </div>

      <div className="tabular mt-3 flex flex-wrap gap-2 text-[13px]">
        {pts.map((p) => (
          <button
            key={p.amps}
            onClick={() => setAmps(p.amps)}
            className="rounded-lg border border-[var(--color-border)] px-2.5 py-1 hover:border-[var(--color-accent)]"
            title="rated point from the manual"
          >
            <span className="text-white">{p.dutyPct}%</span> @ {p.amps}A
          </button>
        ))}
      </div>
      {duty.interpolated && (
        <p className="mt-2 text-[13px] text-[var(--color-muted)]">
          The manual lists the points above; {amps}A falls between them, so this % is interpolated — treat it as a ceiling and stay conservative.
        </p>
      )}
    </div>
  );
}
