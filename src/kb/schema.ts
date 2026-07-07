/**
 * The knowledge-base contract, as Zod schemas + inferred types.
 *
 * This is the single source of truth for the shape of everything under `kb/`.
 * The extraction pipeline (scripts/extract.ts) validates its output against
 * these schemas before writing; the runtime tools (M2, src/agent/tools/*) parse
 * `kb/` back through the same schemas. If the two ever disagree, that's a bug —
 * they derive from this file so they cannot drift (omnipro-knowledge skill).
 *
 * Domain conventions (omnipro-knowledge skill):
 *  - DCEP = DC electrode positive; DCEN = DC electrode negative. Which process
 *    uses which is read off THIS machine's manual, never from priors.
 *  - Duty cycle = % of a 10-minute window at a given output before thermal
 *    protection trips; always stated with the input voltage it was rated at.
 *  - Every record that asserts a manual fact carries `page` (and `source`) so
 *    the agent can cite it (CLAUDE.md invariant #1).
 */

import { z } from "zod";

/** The four welding processes the OmniPro 220 supports. */
export const Process = z.enum(["MIG", "Flux-Cored", "TIG", "Stick"]);
export type Process = z.infer<typeof Process>;

/** Input mains voltage the welder runs on. */
export const InputVoltage = z.union([z.literal(120), z.literal(240)]);
export type InputVoltage = z.infer<typeof InputVoltage>;

/** Which manual a fact came from (for citations + provenance). */
export const Source = z.enum(["owner-manual", "quick-start-guide", "selection-chart"]);
export type Source = z.infer<typeof Source>;

const page = z.number().int().positive();

// ── Duty cycle ────────────────────────────────────────────────────────────
export const DutyCyclePoint = z.object({
  amps: z.number().positive(),
  dutyPct: z.number().min(0).max(100),
});
export const DutyCycleEntry = z.object({
  process: Process,
  inputVoltage: InputVoltage,
  /** Rated points as printed, e.g. {amps:200,dutyPct:25} and {amps:115,dutyPct:100}. */
  points: z.array(DutyCyclePoint).min(1),
  basisMinutes: z.number().positive().default(10),
  page,
  source: Source,
  notes: z.string().optional(),
});
export type DutyCycleEntry = z.infer<typeof DutyCycleEntry>;

// ── Specifications ────────────────────────────────────────────────────────
export const ElectricalSpec = z.object({
  process: Process,
  inputVoltage: InputVoltage,
  /** Amps drawn from the wall at the rated output below. */
  inputCurrentAmps: z.number().positive(),
  atOutputAmps: z.number().positive(),
  weldingCurrentRange: z.object({ minAmps: z.number().positive(), maxAmps: z.number().positive() }),
});
export const CircuitRequirement = z.object({
  inputVoltage: InputVoltage,
  recommendedBreakerAmps: z.number().positive().nullable(),
  plugType: z.string().nullable(),
  notes: z.string().optional(),
});
export const SpecsDoc = z.object({
  model: z.string(),
  itemNumber: z.string(),
  maxOcvVolts: z.number().positive(),
  weldableMaterials: z.array(z.object({ process: Process, materials: z.array(z.string()) })),
  wire: z.object({
    solidDiametersIn: z.array(z.string()),
    fluxCoredDiametersIn: z.array(z.string()),
    speedIpm: z.object({ min: z.number(), max: z.number() }),
    spoolCapacity: z.string(),
  }),
  electrical: z.array(ElectricalSpec),
  circuitRequirements: z.array(CircuitRequirement),
  page,
  source: Source,
});
export type SpecsDoc = z.infer<typeof SpecsDoc>;

// ── Polarity ──────────────────────────────────────────────────────────────
export const Terminal = z.enum(["positive", "negative"]);
export const PolarityEntry = z.object({
  process: Process,
  /** Distinguishes solid-wire MIG from self-/gas-shielded flux-core where it matters. */
  variant: z.string().nullable(),
  /** Which terminal the electrode/wire/torch lead goes to. */
  electrode: Terminal,
  /** Which terminal the ground (work) clamp goes to. */
  groundClamp: Terminal,
  polarity: z.enum(["DCEP", "DCEN"]),
  /** The cable-setup steps as written in the manual. */
  cableSetup: z.array(z.string()),
  page,
  source: Source,
  notes: z.string().optional(),
});
export type PolarityEntry = z.infer<typeof PolarityEntry>;

// ── Synergic / recommended settings ───────────────────────────────────────
export const SynergicSetting = z.object({
  process: Process,
  material: z.string(),
  thicknessLabel: z.string(),
  wireOrElectrodeDiameterIn: z.string().nullable(),
  /** Wire feed speed, if the manual gives one (IPM or a synergic %). */
  wireFeedSpeed: z.string().nullable(),
  /** Voltage / heat setting, if given. */
  voltage: z.string().nullable(),
  gas: z.object({ type: z.string(), scfh: z.object({ min: z.number(), max: z.number() }).nullable() }).nullable(),
  /** True if this value is an input to the machine's synergic program vs a manual override. */
  isSynergicProgramInput: z.boolean(),
  page,
  source: Source,
  notes: z.string().optional(),
});
export type SynergicSetting = z.infer<typeof SynergicSetting>;

// ── Troubleshooting ───────────────────────────────────────────────────────
export const TroubleshootingCause = z.object({
  cause: z.string(),
  check: z.string(),
  /** Manual page a step points to, if any (e.g. "page 17"). */
  pageRef: z.string().nullable(),
});
export const TroubleshootingEntry = z.object({
  /** Which process family this symptom lives under, as titled in the manual. */
  scope: z.string(),
  symptom: z.string(),
  causes: z.array(TroubleshootingCause).min(1),
  page,
  source: Source,
});
export type TroubleshootingEntry = z.infer<typeof TroubleshootingEntry>;

// ── Process selection (the image-only "How to Choose a Welder" chart) ──────
export const ProcessSelectionColumn = z.object({
  process: z.string(),
  skillLevel: z.string(),
  gas: z.string(),
  materials: z.array(z.string()),
  thicknessRange: z.string(),
  applications: z.array(z.string()),
  cleanliness: z.string(),
  advantages: z.array(z.string()),
});
export const MigVsFluxRow = z.object({
  attribute: z.string(),
  mig: z.boolean(),
  fluxCored: z.boolean(),
});
export const ProcessSelectionDoc = z.object({
  columns: z.array(ProcessSelectionColumn),
  migVsFluxCored: z.array(MigVsFluxRow),
  dutyCycleExplanation: z.string(),
  page,
  source: Source,
});
export type ProcessSelectionDoc = z.infer<typeof ProcessSelectionDoc>;

// ── Figures ───────────────────────────────────────────────────────────────
export const FigureKind = z.enum(["panel", "diagram", "photo", "schematic", "chart", "figure"]);
/** Normalized [0..1] bounding box on the source page for tight cropping. */
export const BBox = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
export const FigureIndexEntry = z.object({
  id: z.string(),
  page,
  source: Source,
  caption: z.string(),
  kind: FigureKind,
  tags: z.array(z.string()),
  /** Path relative to kb/, e.g. "figures/img/fig-p12-wire-feed.png". */
  path: z.string(),
  bbox: BBox.nullable(),
});
export type FigureIndexEntry = z.infer<typeof FigureIndexEntry>;

// ── Page-anchored text chunks (for search_manual) ─────────────────────────
export const Chunk = z.object({
  text: z.string(),
  page,
  source: Source,
  section: z.string(),
});
export type Chunk = z.infer<typeof Chunk>;
