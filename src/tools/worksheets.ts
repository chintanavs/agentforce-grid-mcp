import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GridClient } from "../client.js";
import { z } from "zod";

export function registerWorksheetTools(server: McpServer, client: GridClient): void {
  server.tool(
    "create_worksheet",
    "Create a new worksheet within a workbook.",
    {
      name: z.string().describe("The name for the new worksheet"),
      workbookId: z.string().describe("The ID of the workbook to create the worksheet in"),
    },
    async ({ name, workbookId }) => {
      try {
        const result = await client.post("/worksheets", { name, workbookId });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );

  server.tool(
    "get_worksheet",
    "Get metadata for a specific worksheet by its ID. Returns metadata only; use get_worksheet_data to retrieve the full data including columns, rows, and cell values.",
    {
      worksheetId: z.string().describe("The ID of the worksheet to retrieve"),
    },
    async ({ worksheetId }) => {
      try {
        const result = await client.get(`/worksheets/${encodeURIComponent(worksheetId)}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );

  server.tool(
    "get_worksheet_data",
    "Get complete worksheet data including all columns, rows, and cell values. This is the most reliable endpoint for reading worksheet state.",
    {
      worksheetId: z.string().describe("The ID of the worksheet to retrieve data for"),
    },
    async ({ worksheetId }) => {
      try {
        const result = await client.get(`/worksheets/${encodeURIComponent(worksheetId)}/data`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );

  server.tool(
    "get_worksheet_data_generic",
    "Get worksheet data in a flattened/generic format where each cell is a simple key-value pair rather than the nested structure from get_worksheet_data. Useful for simpler data extraction.",
    {
      worksheetId: z.string().describe("The ID of the worksheet to retrieve generic data for"),
    },
    async ({ worksheetId }) => {
      try {
        const result = await client.get(`/worksheets/${encodeURIComponent(worksheetId)}/data-generic`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );

  server.tool(
    "update_worksheet",
    "Update a worksheet's name.",
    {
      worksheetId: z.string().describe("The ID of the worksheet to update"),
      name: z.string().describe("The new name for the worksheet"),
    },
    async ({ worksheetId, name }) => {
      try {
        const result = await client.put(`/worksheets/${encodeURIComponent(worksheetId)}`, { name });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );

  server.tool(
    "delete_worksheet",
    "Delete a worksheet by its ID. This permanently removes the worksheet and all its data.",
    {
      worksheetId: z.string().describe("The ID of the worksheet to delete"),
    },
    async ({ worksheetId }) => {
      try {
        const result = await client.delete(`/worksheets/${encodeURIComponent(worksheetId)}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );

  server.tool(
    "add_rows",
    "Add one or more rows to a worksheet. Optionally specify an anchor row and position to insert rows before or after a specific row.",
    {
      worksheetId: z.string().describe("The ID of the worksheet to add rows to"),
      numberOfRows: z.number().describe("The number of rows to add"),
      anchorRowId: z.string().optional().describe("The ID of an existing row to anchor the new rows relative to"),
      position: z.string().optional().describe("Where to insert rows relative to the anchor row: 'before' or 'after'"),
    },
    async ({ worksheetId, numberOfRows, anchorRowId, position }) => {
      try {
        const body: Record<string, unknown> = { numberOfRows };
        if (anchorRowId !== undefined) body.anchorRowId = anchorRowId;
        if (position !== undefined) body.position = position;
        const result = await client.post(`/worksheets/${encodeURIComponent(worksheetId)}/rows`, body);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );

  server.tool(
    "delete_rows",
    "Delete one or more rows from a worksheet by their row IDs.",
    {
      worksheetId: z.string().describe("The ID of the worksheet to delete rows from"),
      rowIds: z.array(z.string()).describe("Array of row IDs to delete"),
    },
    async ({ worksheetId, rowIds }) => {
      try {
        const result = await client.post(`/worksheets/${encodeURIComponent(worksheetId)}/delete-rows`, { rowIds });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );

  server.tool(
    "import_csv",
    "Import a CSV file into a worksheet. The CSV must already be uploaded as a document (e.g., a ContentVersion in Salesforce).",
    {
      worksheetId: z.string().describe("The ID of the worksheet to import data into"),
      documentId: z.string().describe("The ID of the uploaded CSV document to import"),
      includeHeaders: z.boolean().describe("Whether the CSV file includes a header row"),
    },
    async ({ worksheetId, documentId, includeHeaders }) => {
      try {
        const result = await client.post(
          `/worksheets/${encodeURIComponent(worksheetId)}/import-csv?documentId=${encodeURIComponent(documentId)}&includeHeaders=${includeHeaders}`
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );

  server.tool(
    "run_worksheet",
    "Run a worksheet with specific row inputs and column configuration, returning a job ID for polling. Use get_run_worksheet_job to poll for results. Optional runStrategy: 'ColumnByColumn' for sequential column execution (default runs all columns in parallel).",
    {
      config: z.string().describe("JSON string with run configuration including worksheetId, row inputs, and column config"),
    },
    async ({ config }) => {
      try {
        let configObj: unknown;
        try {
          configObj = JSON.parse(config);
        } catch (e) {
          return { content: [{ type: "text" as const, text: `Invalid JSON in config parameter: ${(e as Error).message}` }] };
        }
        const result = await client.post("/run-worksheet", configObj);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );

  server.tool(
    "get_run_worksheet_job",
    "Get the status and results of a worksheet run job. Poll this endpoint until the job completes.",
    {
      jobId: z.string().describe("The job ID returned by run_worksheet"),
    },
    async ({ jobId }) => {
      try {
        const result = await client.get(`/run-worksheet/${encodeURIComponent(jobId)}`);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );
}
