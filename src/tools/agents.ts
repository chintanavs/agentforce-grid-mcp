import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GridClient } from "../client.js";
import { z } from "zod";

export function registerAgentTools(server: McpServer, client: GridClient): void {
  server.tool(
    "get_agents",
    "Get all active agents in the org",
    {
      includeDrafts: z
        .boolean()
        .optional()
        .describe("Whether to include draft agents. Defaults to false."),
    },
    async ({ includeDrafts }) => {
      try {
        const path = includeDrafts ? "/agents?includeDrafts=true" : "/agents";
        const result = await client.get(path);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error fetching agents: ${message}` }],
        };
      }
    }
  );


  server.tool(
    "get_agent_variables",
    "Get context variables for a specific agent version. Use the activeVersion from get_agents.",
    {
      versionId: z.string().describe("The agent version ID"),
    },
    async ({ versionId }) => {
      try {
        const result = await client.get(`/agents/${encodeURIComponent(versionId)}/variables`);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            { type: "text", text: `Error fetching agent variables: ${message}` },
          ],
        };
      }
    }
  );
}
