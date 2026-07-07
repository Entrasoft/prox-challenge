"use client";

import { useState } from "react";
import type { SettingsConfiguratorProps } from "./props";

export default function SettingsConfigurator({ props }: { props: SettingsConfiguratorProps }) {
  const { process, examples, note } = props;
  const materials = [...new Set(examples.map((e) => e.material))];
  const [material, setMaterial] = useState(materials[0] ?? "");
  const shown = examples.filter((e) => !material || e.material === material);

  return (
    <div>
      <div className="mb-2 text-[15px] font-semibold">{process} settings</div>
      <p className="mb-3 text-[14px] text-[var(--color-muted)]">{note}</p>

      {materials.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2 text-[13px]">
          {materials.map((m) => (
            <button
              key={m}
              onClick={() => setMaterial(m)}
              className={`rounded-lg border px-2.5 py-1 ${
                m === material ? "border-[var(--color-accent)] text-white" : "border-[var(--color-border)] text-[var(--color-muted)]"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 text-[14px] text-[var(--color-muted)]">
          The manual prints no worked example for this process — set wire diameter and thickness on the LCD and read the recommended wire-feed speed and voltage off the machine.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((e, i) => (
            <div key={i} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
              <div className="mb-2 text-[14px] font-semibold text-white">
                {e.material}
                {e.thicknessLabel ? ` · ${e.thicknessLabel}` : ""}
                {e.wireOrElectrodeDiameterIn ? ` · ${e.wireOrElectrodeDiameterIn}" wire` : ""}
              </div>
              <div className="tabular grid grid-cols-2 gap-x-4 gap-y-1.5 text-[14px] sm:grid-cols-4">
                <Field label="Wire feed" value={e.wireFeedSpeed} />
                <Field label="Voltage" value={e.voltage} />
                <Field label="Gas" value={e.gas ? e.gas.type : null} />
                <Field label="Flow" value={e.gas?.scfh ? `${e.gas.scfh.min}–${e.gas.scfh.max} SCFH` : null} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--color-faint)]">{label}</div>
      <div className={value ? "text-white" : "text-[var(--color-faint)]"}>{value ?? "set on machine"}</div>
    </div>
  );
}
