import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GridClient } from "../client.js";

export function registerUrlTools(server: McpServer, client: GridClient): void {
  server.tool(
    "get_url",
    `Generate a Lightning Experience URL for a Salesforce resource. Supports:
- grid: Agentforce Grid Studio workbook/worksheet (default)
- record: Lightning record page for any SObject
- flow: Flow Builder for a specific flow
- setup: Setup page (e.g. ObjectManager, FlowDefinition)

Returns the full URL that can be opened in a browser.`,
    {
      type: z.enum(["grid", "record", "flow", "setup"]).optional().describe(
        "Type of URL to generate (default: 'grid')"
      ),
      workbookId: z.string().optional().describe("Grid workbook ID (for type 'grid')"),
      worksheetId: z.string().optional().describe("Grid worksheet ID (for type 'grid', optional)"),
      recordId: z.string().optional().describe("Record ID (for type 'record')"),
      sobjectType: z.string().optional().describe("SObject API name, e.g. 'Account' (for type 'record')"),
      flowId: z.string().optional().describe("Flow definition ID (for type 'flow')"),
      page: z.string().optional().describe("Setup page name, e.g. 'ObjectManager', 'FlowDefinition' (for type 'setup')"),
    },
    async ({ type: _type, workbookId, worksheetId, recordId, sobjectType, flowId, page }) => {
      try {
        const type = _type ?? "grid";
        const base = client.lightningBaseUrl;

        switch (type) {
          case "grid": {
            if (!workbookId) {
              return { content: [{ type: "text" as const, text: "Error: workbookId is required for type 'grid'" }] };
            }
            let url = `${base}/AgentforceGrid/gridStudio.app#/grid?gridId=${encodeURIComponent(workbookId)}`;
            if (worksheetId) {
              url += `&worksheetId=${encodeURIComponent(worksheetId)}`;
            }
            return { content: [{ type: "text" as const, text: url }] };
          }

          case "record": {
            if (!recordId || !sobjectType) {
              return { content: [{ type: "text" as const, text: "Error: recordId and sobjectType are required for type 'record'" }] };
            }
            const url = `${base}/lightning/r/${encodeURIComponent(sobjectType)}/${encodeURIComponent(recordId)}/view`;
            return { content: [{ type: "text" as const, text: url }] };
          }

          case "flow": {
            if (!flowId) {
              return { content: [{ type: "text" as const, text: "Error: flowId is required for type 'flow'" }] };
            }
            const url = `${base}/builder_platform_interaction/flowBuilder.app?flowId=${encodeURIComponent(flowId)}`;
            return { content: [{ type: "text" as const, text: url }] };
          }

          case "setup": {
            if (!page) {
              return { content: [{ type: "text" as const, text: "Error: page is required for type 'setup'" }] };
            }
            const url = `${base}/lightning/setup/${encodeURIComponent(page)}/home`;
            return { content: [{ type: "text" as const, text: url }] };
          }

          default:
            return { content: [{ type: "text" as const, text: `Error: Unknown URL type '${type}'` }] };
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );
}
