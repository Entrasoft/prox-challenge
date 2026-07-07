/**
 * lookup_table — the "numbers come from the KB, never from priors" tool
 * (CLAUDE.md invariant #1). Every duty cycle, spec, polarity, and setting the
 * agent asserts must come from here, and every row carries page + source.
 */

import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { Process } from "@/kb/schema";
import * as kb from "@/kb/store";

const Table = z.enum([
  "duty-cycle",
  "specs",
  "polarity",
  "synergic-settings",
  "troubleshooting",
  "process-selection",
]);

export const lookupTableTool = tool(
  "lookup_table",
  "Look up authoritative typed values from the OmniPro 220 knowledge base. ALWAYS use this before stating any number, polarity, or setting. Tables: 'duty-cycle' (rated % @ amps per process×voltage), 'specs' (ratings, ranges, materials, wire, breaker/circuit), 'polarity' (electrode/ground terminal + DCEP/DCEN per process), 'synergic-settings' (wire feed / voltage / gas examples), 'troubleshooting' (symptom → causes+checks), 'process-selection' (how to choose a process). Every row carries page + source; cite them.",
  {
    table: Table.describe("which KB table to read"),
    process: Process.optional().describe("filter by process (MIG, Flux-Cored, TIG, Stick)"),
    inputVoltage: z.union([z.literal(120), z.literal(240)]).optional().describe("filter duty-cycle by mains voltage"),
    material: z.string().optional().describe("filter synergic-settings by material"),
    query: z.string().optional().describe("keyword filter for troubleshooting / synergic-settings"),
  },
  async ({ table, process, inputVoltage, material, query }) => {
    let data: unknown;
    switch (table) {
      case "duty-cycle":
        data = kb.dutyCycle({ process, inputVoltage });
        break;
      case "specs":
        data = kb.specs();
        break;
      case "polarity":
        data = kb.polarity({ process });
        break;
      case "synergic-settings":
        data = kb.synergicSettings({ process, material, query });
        break;
      case "troubleshooting":
        data = kb.troubleshooting({ query });
        break;
      case "process-selection":
        data = kb.processSelection();
        break;
    }
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  },
  { annotations: { readOnlyHint: true } },
);
