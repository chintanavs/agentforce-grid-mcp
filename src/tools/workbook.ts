import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GridClient } from "../client.js";
import { z } from "zod";
import { requireParam, ValidationError } from "../lib/validation.js";

export function registerWorkbookTool(server: McpServer, client: GridClient): void {
  server.tool(
    "workbook",
    "Manage workbooks: list, create, create_with_worksheet, get, get_worksheets, delete",
    {
      action: z.enum(["list", "create", "create_with_worksheet", "get", "get_worksheets", "delete"]),
      workbookId: z.string().optional().describe("Required for get, get_worksheets, delete"),
      name: z.string().optional().describe("Required for create and create_with_worksheet (workbook name)"),
      worksheetName: z.string().optional().describe("Required for create_with_worksheet"),
    },
    async ({ action, workbookId, name, worksheetName }) => {
      try {
        switch (action) {
          case "list": {
            const result = await client.get("/workbooks");
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          case "create": {
            requireParam(name, "name", "create");
            const result = await client.post("/workbooks", { name });
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          case "create_with_worksheet": {
            requireParam(name, "name", "create_with_worksheet");
            requireParam(worksheetName, "worksheetName", "create_with_worksheet");
            const workbook = await client.post("/workbooks", { name });
            const worksheet = await client.post("/worksheets", { name: worksheetName, workbookId: workbook.id });
            const result = { workbookId: workbook.id, worksheetId: worksheet.id, workbook, worksheet };
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          case "get": {
            requireParam(workbookId, "workbookId", "get");
            const result = await client.get(`/workbooks/${encodeURIComponent(workbookId)}`);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          case "get_worksheets": {
            requireParam(workbookId, "workbookId", "get_worksheets");
            const result = await client.get(`/workbooks/${encodeURIComponent(workbookId)}/worksheets`);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          case "delete": {
            requireParam(workbookId, "workbookId", "delete");
            const result = await client.delete(`/workbooks/${encodeURIComponent(workbookId)}`);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }
        }
      } catch (error: unknown) {
        if (error instanceof ValidationError) {
          return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
        }
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
      }
    }
  );
}
