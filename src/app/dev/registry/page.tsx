/**
 * /dev/registry — eyeball route (artifact-protocol skill). Renders every registry
 * component (with real KB-grounded props) plus one of each other artifact type,
 * all through the same ArtifactRenderer the chat uses.
 */

import type { PxartBlock } from "@/artifacts/protocol";
import type { RegistryComponent } from "@/kb/store";
import { registryProps } from "@/kb/store";
import { ArtifactRenderer } from "@/components/artifacts/ArtifactRenderer";

function comp(id: string, name: RegistryComponent, params: Record<string, unknown>): PxartBlock {
  const r = registryProps(name, params);
  return { kind: "component", id, name, props: (r.props ?? {}) as Record<string, unknown> };
}

const REACT_SAMPLE = `export default function Art(){
  const [deg,setDeg] = React.useState(30);
  const rad = deg*Math.PI/180;
  return (
    <div>
      <div style={{fontSize:14,color:'#9aa7b4'}}>Bevel angle: <b style={{color:'#fff'}}>{deg}°</b></div>
      <input type="range" min="0" max="60" value={deg} onChange={e=>setDeg(+e.target.value)} style={{marginTop:8}}/>
      <svg viewBox="0 0 220 130" style={{width:'100%',maxWidth:280,marginTop:8}}>
        <rect x="20" y="80" width="180" height="18" fill="#3b4654"/>
        <line x1="110" y1="80" x2={110+70*Math.sin(rad)} y2={80-70*Math.cos(rad)} stroke="#ff6a1a" strokeWidth="4" strokeLinecap="round"/>
      </svg>
    </div>
  );
}`;

const blocks: { label: string; block: PxartBlock }[] = [
  { label: "component · DutyCycleCalculator", block: comp("d1", "DutyCycleCalculator", { process: "MIG" }) },
  { label: "component · PolarityDiagram (TIG)", block: comp("d2", "PolarityDiagram", { process: "TIG" }) },
  { label: "component · PolarityDiagram (MIG)", block: comp("d2b", "PolarityDiagram", { process: "MIG" }) },
  { label: "component · SettingsConfigurator", block: comp("d3", "SettingsConfigurator", { process: "MIG" }) },
  { label: "component · TroubleshootingFlow", block: comp("d4", "TroubleshootingFlow", { query: "porosity holes bead" }) },
  {
    label: "image-ref · front panel",
    block: { kind: "image-ref", id: "d5", figure: "fig-p8-front-panel-controls-diagram", caption: "Front panel controls" },
  },
  {
    label: "svg · sample",
    block: {
      kind: "svg",
      id: "d6",
      title: "Sample SVG",
      svg: `<svg viewBox="0 0 300 90"><rect x="10" y="30" width="120" height="30" rx="6" fill="#e5484d"/><rect x="170" y="30" width="120" height="30" rx="6" fill="#3b4654"/><text x="70" y="50" fill="#fff" font-size="14" text-anchor="middle">+ DCEP</text><text x="230" y="50" fill="#fff" font-size="14" text-anchor="middle">- DCEN</text></svg>`,
    },
  },
  { label: "react · sandboxed interactive", block: { kind: "react", id: "d7", title: "Bevel-angle explorer", code: REACT_SAMPLE } },
  {
    label: "component · bad props (error card)",
    block: { kind: "component", id: "d8", name: "DutyCycleCalculator", props: { process: "NOPE" } },
  },
];

export default function DevRegistry() {
  return (
    <div className="mx-auto max-w-[720px] px-4 py-8">
      <h1 className="text-[20px] font-semibold">Artifact registry — dev</h1>
      <p className="mt-1 text-[14px] text-[var(--color-muted)]">
        Every artifact type through the real renderer. Not linked from the app.
      </p>
      <div className="mt-6 flex flex-col gap-8">
        {blocks.map(({ label, block }) => (
          <section key={block.id}>
            <div className="mb-1 font-[family-name:var(--font-mono)] text-[12px] text-[var(--color-faint)]">{label}</div>
            <ArtifactRenderer block={block} />
          </section>
        ))}
      </div>
    </div>
  );
}
