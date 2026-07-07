/**
 * get_figure — find manual figures (diagrams, photos, schematics, the control
 * panel, the process-selection chart) by keyword/tag. Returns figure references
 * with page + source + crop path. In M2 the agent cites these; M4 renders them.
 */

import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { findFigures } from "@/kb/store";

export const getFigureTool = tool(
  "get_figure",
  "Find figures from the OmniPro 220 manual — control-panel diagrams, wire-feed/tensioner illustrations, polarity/cable-setup diagrams, the wiring schematic, weld-diagnosis photos, and the process-selection chart. Returns figure id, caption, page, source, and crop path. Use when a physical/setup answer would be clearer with the manual's own figure.",
  {
    query: z.string().describe("what the figure should show, e.g. 'wire feed tensioner' or 'front panel controls'"),
    tags: z.array(z.string()).optional().describe("optional tag hints, e.g. ['polarity','tig']"),
    topK: z.number().int().min(1).max(8).default(4),
  },
  async ({ query, tags, topK }) => {
    const results = findFigures(query, { tags, topK });
    return { content: [{ type: "text", text: JSON.stringify(results) }] };
  },
  { annotations: { readOnlyHint: true } },
);
