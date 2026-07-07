/**
 * Registry component prop contracts (Zod). The single shared shape:
 *  - src/kb/store.ts `registryProps` builds + validates these (server), so the
 *    get_registry_props tool returns KB-grounded props;
 *  - the components parse these (client), so bad props render an error card, not
 *    a crash (artifact-protocol skill).
 * Pure schemas only (no React, no fs) so it's safe to import on both sides.
 */

import { z } from "zod";
import { Process, Source, Terminal, InputVoltage } from "@/kb/schema";

const page = z.number().int().positive();

export const DutyCycleCalculatorProps = z.object({
  process: Process,
  entries: z.array(
    z.object({
      inputVoltage: InputVoltage,
      points: z.array(z.object({ amps: z.number(), dutyPct: z.number() })).min(1),
    }),
  ),
  weldingCurrentRange: z.array(
    z.object({ inputVoltage: InputVoltage, minAmps: z.number(), maxAmps: z.number() }),
  ),
  page,
  source: Source,
});
export type DutyCycleCalculatorProps = z.infer<typeof DutyCycleCalculatorProps>;

export const PolarityDiagramProps = z.object({
  process: Process,
  electrode: Terminal,
  groundClamp: Terminal,
  polarity: z.enum(["DCEP", "DCEN"]),
  cableSetup: z.array(z.string()),
  page,
  source: Source,
});
export type PolarityDiagramProps = z.infer<typeof PolarityDiagramProps>;

export const SettingsConfiguratorProps = z.object({
  process: Process,
  examples: z.array(
    z.object({
      material: z.string(),
      thicknessLabel: z.string(),
      wireOrElectrodeDiameterIn: z.string().nullable(),
      wireFeedSpeed: z.string().nullable(),
      voltage: z.string().nullable(),
      gas: z
        .object({ type: z.string(), scfh: z.object({ min: z.number(), max: z.number() }).nullable() })
        .nullable(),
      page,
      source: Source,
    }),
  ),
  note: z.string(),
});
export type SettingsConfiguratorProps = z.infer<typeof SettingsConfiguratorProps>;

export const TroubleshootingFlowProps = z.object({
  symptom: z.string(),
  entries: z.array(
    z.object({
      symptom: z.string(),
      causes: z.array(z.object({ cause: z.string(), check: z.string(), pageRef: z.string().nullable() })),
      page,
      source: Source,
    }),
  ),
});
export type TroubleshootingFlowProps = z.infer<typeof TroubleshootingFlowProps>;

/** name → prop schema, used to validate a `component` block's props before render. */
export const REGISTRY_PROP_SCHEMAS = {
  DutyCycleCalculator: DutyCycleCalculatorProps,
  PolarityDiagram: PolarityDiagramProps,
  SettingsConfigurator: SettingsConfiguratorProps,
  TroubleshootingFlow: TroubleshootingFlowProps,
} as const;

export type RegistryName = keyof typeof REGISTRY_PROP_SCHEMAS;
