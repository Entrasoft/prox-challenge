/**
 * search_manual — full-text search over the manual's page-anchored prose chunks.
 * Use for procedures, warnings, and how-tos; use lookup_table for numeric tables.
 */

import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { searchManual } from "@/kb/store";

export const searchManualTool = tool(
  "search_manual",
  "Full-text search the OmniPro 220 manual for procedures, warnings, setup steps, and explanations. Returns page-anchored text chunks with source + page for citation. Use this for how-to and prose; use lookup_table for numeric tables (duty cycle, specs, polarity, settings).",
  {
    query: z.string().describe("keywords or a natural-language question"),
    topK: z.number().int().min(1).max(12).default(6).describe("how many chunks to return"),
  },
  async ({ query, topK }) => {
    const results = searchManual(query, topK);
    return { content: [{ type: "text", text: JSON.stringify(results) }] };
  },
  { annotations: { readOnlyHint: true } },
);
