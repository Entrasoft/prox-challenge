/**
 * The OmniPro in-process MCP tool server. Tools are exposed to the agent as
 * `mcp__omnipro__<tool>` and allowlisted in src/agent/agent.ts. Keep this list
 * (and each tool's name/description) byte-stable — the SDK caches tool defs, so
 * churn here invalidates the prompt cache (references/patterns.md).
 */

import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { lookupTableTool } from "./lookup-table";
import { searchManualTool } from "./search-manual";
import { getFigureTool } from "./get-figure";
import { getRegistryPropsTool } from "./get-registry-props";

export const MCP_SERVER_NAME = "omnipro";

export const omniproServer = createSdkMcpServer({
  name: MCP_SERVER_NAME,
  version: "1.0.0",
  tools: [lookupTableTool, searchManualTool, getFigureTool, getRegistryPropsTool],
});

/** Wildcard that auto-approves every tool on this server. */
export const ALLOWED_TOOLS = [`mcp__${MCP_SERVER_NAME}__*`];
