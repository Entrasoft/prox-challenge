/**
 * Registry — the typed `name → { Component, schema }` map the ComponentBlock
 * renderer uses to look up an agent-requested component and zod-validate its
 * props before rendering (bad props → error card, never a crash).
 */

import type { ComponentType } from "react";
import type { z } from "zod";
import DutyCycleCalculator from "./DutyCycleCalculator";
import PolarityDiagram from "./PolarityDiagram";
import SettingsConfigurator from "./SettingsConfigurator";
import TroubleshootingFlow from "./TroubleshootingFlow";
import {
  DutyCycleCalculatorProps,
  PolarityDiagramProps,
  SettingsConfiguratorProps,
  TroubleshootingFlowProps,
  type RegistryName,
} from "./props";

// The map is heterogeneous (each component has its own validated prop type); the
// single `any` bridges that at the lookup boundary — props are validated by the
// matching schema at runtime before render.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = ComponentType<{ props: any }>;
interface RegistryEntry {
  Component: AnyComponent;
  schema: z.ZodTypeAny;
}

export const REGISTRY: Record<RegistryName, RegistryEntry> = {
  DutyCycleCalculator: { Component: DutyCycleCalculator, schema: DutyCycleCalculatorProps },
  PolarityDiagram: { Component: PolarityDiagram, schema: PolarityDiagramProps },
  SettingsConfigurator: { Component: SettingsConfigurator, schema: SettingsConfiguratorProps },
  TroubleshootingFlow: { Component: TroubleshootingFlow, schema: TroubleshootingFlowProps },
};

export function isRegistryName(name: string): name is RegistryName {
  return name in REGISTRY;
}

export type { RegistryName };
