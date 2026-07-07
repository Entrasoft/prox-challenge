/**
 * get_registry_props — returns validated props (built from the KB) for a
 * registry component. The components render in M4; this tool completes the M2
 * toolset (SPEC M2) so the agent prompt and eval harness are stable across the
 * M4 change. The agent only emits component blocks once M4 adds the artifact
 * grammar to the system prompt.
 */

import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { Process } from "@/kb/schema";
import { RegistryComponent, registryProps } from "@/kb/store";

export const getRegistryPropsTool = tool(
  "get_registry_props",
  "Build props (from the KB) for an interactive registry component: DutyCycleCalculator, PolarityDiagram, SettingsConfigurator, or TroubleshootingFlow. Returns KB-grounded props (with page + source) to embed in a component artifact. Call this before emitting a component so its data comes from the manual, never hand-authored.",
  {
    component: RegistryComponent.describe("which registry component to build props for"),
    process: Process.optional(),
    inputVoltage: z.union([z.literal(120), z.literal(240)]).optional(),
    material: z.string().optional(),
    symptom: z.string().optional(),
    query: z.string().optional(),
  },
  async ({ component, ...params }) => {
    const result = registryProps(component, params);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
  { annotations: { readOnlyHint: true } },
);
