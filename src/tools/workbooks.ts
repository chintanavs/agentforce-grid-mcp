import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GridClient } from "../client.js";
import { z } from "zod";

export function registerWorkbookTools(server: McpServer, client: GridClient): void {
  server.tool(
    "get_workbooks",
    "List all workbooks available in the Grid Connect workspace.",
    {},
    async () => {
      try {
        const result = await client.get("/workbooks");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );

  server.tool(
    "create_workbook",
    "Create a new workbook with the given name.",
    {
      name: z.string().describe("The name for the new workbook"),
    },
    async ({ name }) => {
      try {
        const result = await client.post("/workbooks", { name });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );

  server.tool(
    "get_workbook",
    "Get details of a specific workbook by its ID.",
    {
      workbookId: z.string().describe("The ID of the workbook to retrieve"),
    },
    async ({ workbookId }) => {
      try {
        const result = await client.get(`/workbooks/${encodeURIComponent(workbookId)}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );

  server.tool(
    "get_workbook_worksheets",
    "Get all worksheets for a specific workbook.",
    {
      workbookId: z.string().describe("The ID of the workbook"),
    },
    async ({ workbookId }) => {
      try {
        const result = await client.get(`/workbooks/${encodeURIComponent(workbookId)}/worksheets`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );

  server.tool(
    "delete_workbook",
    "Delete a workbook by its ID. This permanently removes the workbook and all its contents.",
    {
      workbookId: z.string().describe("The ID of the workbook to delete"),
    },
    async ({ workbookId }) => {
      try {
        const result = await client.delete(`/workbooks/${encodeURIComponent(workbookId)}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );
}
