"use client";

import type { PolarityDiagramProps } from "./props";

const ELECTRODE_LABEL: Record<string, string> = {
  MIG: "Wire-feed gun",
  "Flux-Cored": "Wire-feed gun",
  TIG: "TIG torch",
  Stick: "Electrode holder",
};

// Polarity color convention (design-system): red = positive (+/DCEP), dark = negative (−).
const POS = "#e5484d";
const NEG = "#3b4654";

export default function PolarityDiagram({ props }: { props: PolarityDiagramProps }) {
  const { process, electrode, groundClamp, polarity, cableSetup } = props;
  const electrodeLabel = ELECTRODE_LABEL[process] ?? "Electrode lead";
  const elePos = electrode === "positive";

  // Left socket is negative, right socket is positive (machine face).
  const negFill = NEG;
  const posFill = POS;
  // Which socket each lead routes to.
  const eleTargetX = elePos ? 470 : 190;
  const gndTargetX = groundClamp === "positive" ? 470 : 190;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span
          className="tabular rounded-md px-2 py-0.5 text-[13px] font-semibold text-white"
          style={{ background: polarity === "DCEP" ? POS : NEG }}
        >
          {polarity}
        </span>
        <span className="text-[13px] text-[var(--color-muted)]">
          {polarity === "DCEP" ? "electrode positive" : "electrode negative"}
        </span>
      </div>

      <svg viewBox="0 0 640 300" className="w-full" role="img" aria-label={`${process} polarity hookup`}>
        {/* machine output panel */}
        <rect x="120" y="150" width="420" height="120" rx="12" fill="var(--color-surface-2)" stroke="var(--color-border)" />
        <text x="330" y="255" textAnchor="middle" fontSize="12" fill="var(--color-faint)">welder output</text>

        {/* negative socket (left) */}
        <circle cx="190" cy="190" r="26" fill={negFill} stroke="#000" strokeWidth="2" />
        <text x="190" y="197" textAnchor="middle" fontSize="24" fontWeight="700" fill="#fff">−</text>
        <text x="190" y="150" textAnchor="middle" fontSize="12" fill="var(--color-muted)">Negative</text>

        {/* positive socket (right) */}
        <circle cx="470" cy="190" r="26" fill={posFill} stroke="#000" strokeWidth="2" />
        <text x="470" y="198" textAnchor="middle" fontSize="24" fontWeight="700" fill="#fff">+</text>
        <text x="470" y="150" textAnchor="middle" fontSize="12" fill="var(--color-muted)">Positive</text>

        {/* electrode lead */}
        <line x1={eleTargetX} y1="190" x2={eleTargetX} y2="70" stroke={elePos ? POS : NEG} strokeWidth="5" strokeLinecap="round" />
        <rect x={eleTargetX - 70} y="36" width="140" height="30" rx="6" fill="var(--color-surface)" stroke={elePos ? POS : NEG} />
        <text x={eleTargetX} y="56" textAnchor="middle" fontSize="13" fontWeight="600" fill="#fff">{electrodeLabel}</text>

        {/* ground clamp lead */}
        <line x1={gndTargetX} y1="216" x2={gndTargetX} y2="284" stroke={groundClamp === "positive" ? POS : NEG} strokeWidth="5" strokeLinecap="round" />
        <rect x={gndTargetX - 60} y="284" width="120" height="14" rx="4" fill="var(--color-surface)" stroke={groundClamp === "positive" ? POS : NEG} />
        <text x={gndTargetX} y="295" textAnchor="middle" fontSize="12" fontWeight="600" fill="#fff">Ground clamp</text>
      </svg>

      <ul className="mt-3 flex flex-col gap-1 text-[15px]">
        <li>
          <b className="text-white">{electrodeLabel}</b> →{" "}
          <b style={{ color: elePos ? POS : "#c3ccd6" }}>
            {electrode} ({elePos ? "+" : "−"})
          </b>{" "}
          terminal
        </li>
        <li>
          <b className="text-white">Ground clamp</b> →{" "}
          <b style={{ color: groundClamp === "positive" ? POS : "#c3ccd6" }}>{groundClamp}</b> terminal
        </li>
      </ul>

      {cableSetup.length > 0 && (
        <ol className="mt-3 list-decimal pl-5 text-[14px] text-[var(--color-muted)]">
          {cableSetup.map((s, i) => (
            <li key={i} className="my-0.5">
              {s}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
