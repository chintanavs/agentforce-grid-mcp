import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GridClient } from "../client.js";
import { z } from "zod";

export function registerCellTools(server: McpServer, client: GridClient): void {
  server.tool(
    "update_cells",
    "Update multiple cells in a worksheet. Cells param is a JSON array of cell objects. Use fullContent (an object) for updates -- displayContent is read-only.",
    {
      worksheetId: z.string().describe("The worksheet containing the cells"),
      cells: z.string().describe('JSON string of cells array. Each cell: { id, fullContent: { text: "value" } }. Note: displayContent is read-only; use fullContent for updates.'),
    },
    async ({ worksheetId, cells }) => {
      try {
        let cellsArr: unknown;
        try {
          cellsArr = JSON.parse(cells);
        } catch (e) {
          return { content: [{ type: "text" as const, text: `Invalid JSON in cells parameter: ${(e as Error).message}` }] };
        }
        const result = await client.put(`/worksheets/${encodeURIComponent(worksheetId)}/cells`, { cells: cellsArr });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );

  server.tool(
    "paste_data",
    "Paste a matrix of data into the worksheet starting at the specified column and row. Matrix is a JSON 2D array where each cell has displayContent.",
    {
      worksheetId: z.string().describe("The worksheet to paste data into"),
      startColumnId: z.string().describe("The column ID to start pasting at"),
      startRowId: z.string().describe("The row ID to start pasting at"),
      matrix: z.string().describe("JSON string of 2D array. Each cell: { displayContent: \"value\" }"),
    },
    async ({ worksheetId, startColumnId, startRowId, matrix }) => {
      try {
        let matrixArr: unknown;
        try {
          matrixArr = JSON.parse(matrix);
        } catch (e) {
          return { content: [{ type: "text" as const, text: `Invalid JSON in matrix parameter: ${(e as Error).message}` }] };
        }
        const result = await client.post(`/worksheets/${encodeURIComponent(worksheetId)}/paste`, {
          startColumnId,
          startRowId,
          matrix: matrixArr,
        });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );

  server.tool(
    "trigger_row_execution",
    "Trigger execution/processing of rows. Use trigger types: RUN_ROW (with rowIds), RUN_SELECTION (with seedCellIds), EDIT (with editedCells), or PASTE (with startColumnId, matrix).",
    {
      worksheetId: z.string().describe("The worksheet to trigger execution in"),
      config: z.string().describe("JSON string with trigger config. Supports: { trigger: \"RUN_ROW\", rowIds: [...] } or { trigger: \"RUN_SELECTION\", seedCellIds: [...] }"),
    },
    async ({ worksheetId, config }) => {
      try {
        let configObj: unknown;
        try {
          configObj = JSON.parse(config);
        } catch (e) {
          return { content: [{ type: "text" as const, text: `Invalid JSON in config parameter: ${(e as Error).message}` }] };
        }
        const result = await client.post(`/worksheets/${encodeURIComponent(worksheetId)}/trigger-row-execution`, configObj);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );

  server.tool(
    "validate_formula",
    "Validate a formula column configuration before creating it.",
    {
      worksheetId: z.string().describe("The worksheet to validate the formula against"),
      config: z.string().describe("JSON string with formula, returnType, referenceAttributes"),
    },
    async ({ worksheetId, config }) => {
      try {
        let configObj: unknown;
        try {
          configObj = JSON.parse(config);
        } catch (e) {
          return { content: [{ type: "text" as const, text: `Invalid JSON in config parameter: ${(e as Error).message}` }] };
        }
        const result = await client.post(`/worksheets/${encodeURIComponent(worksheetId)}/validate-formula`, configObj);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );

  server.tool(
    "generate_ia_input",
    "Generate the input payload JSON for an Invocable Action column. Provide the column's action configuration and the tool will produce the properly formatted input payload with placeholder references.",
    {
      worksheetId: z.string().describe("The worksheet containing the invocable action column"),
      config: z.string().describe("JSON string with invocable action column configuration"),
    },
    async ({ worksheetId, config }) => {
      try {
        let configObj: unknown;
        try {
          configObj = JSON.parse(config);
        } catch (e) {
          return { content: [{ type: "text" as const, text: `Invalid JSON in config parameter: ${(e as Error).message}` }] };
        }
        const result = await client.post(`/worksheets/${encodeURIComponent(worksheetId)}/generate-ia-input`, configObj);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );
}
