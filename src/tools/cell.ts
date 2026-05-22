import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GridClient } from "../client.js";
import { z } from "zod";
import { requireParam, ValidationError } from "../lib/validation.js";

export function registerCellTool(server: McpServer, client: GridClient): void {
  server.tool(
    "cell",
    "Cell operations: update, paste, trigger_execution, validate_formula, generate_ia_input",
    {
      action: z.enum(["update", "paste", "trigger_execution", "validate_formula", "generate_ia_input"]),
      worksheetId: z.string().describe("The worksheet containing the cells"),
      cells: z.string().optional().describe('JSON string of cells array for update. Each cell: { id, fullContent: { text: "value" } }'),
      startColumnId: z.string().optional().describe("Column ID to start pasting at (for paste)"),
      startRowId: z.string().optional().describe("Row ID to start pasting at (for paste)"),
      matrix: z.string().optional().describe('JSON string of 2D array for paste. Each cell: { displayContent: "value" }'),
      config: z.string().optional().describe("JSON string for trigger_execution, validate_formula, generate_ia_input"),
    },
    async ({ action, worksheetId, cells, startColumnId, startRowId, matrix, config }) => {
      try {
        switch (action) {
          case "update": {
            requireParam(cells, "cells", "update");
            let cellsArr: unknown;
            try {
              cellsArr = JSON.parse(cells);
            } catch (e) {
              return { content: [{ type: "text" as const, text: `Invalid JSON in cells parameter: ${(e as Error).message}` }], isError: true };
            }
            const result = await client.put(`/worksheets/${encodeURIComponent(worksheetId)}/cells`, { cells: cellsArr });
            return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
          }

          case "paste": {
            requireParam(startColumnId, "startColumnId", "paste");
            requireParam(startRowId, "startRowId", "paste");
            requireParam(matrix, "matrix", "paste");
            let matrixArr: unknown;
            try {
              matrixArr = JSON.parse(matrix);
            } catch (e) {
              return { content: [{ type: "text" as const, text: `Invalid JSON in matrix parameter: ${(e as Error).message}` }], isError: true };
            }
            const result = await client.post(`/worksheets/${encodeURIComponent(worksheetId)}/paste`, {
              startColumnId,
              startRowId,
              matrix: matrixArr,
            });
            return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
          }

          case "trigger_execution": {
            requireParam(config, "config", "trigger_execution");
            let configObj: unknown;
            try {
              configObj = JSON.parse(config);
            } catch (e) {
              return { content: [{ type: "text" as const, text: `Invalid JSON in config parameter: ${(e as Error).message}` }], isError: true };
            }
            const result = await client.post(`/worksheets/${encodeURIComponent(worksheetId)}/trigger-row-execution`, configObj);
            return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
          }

          case "validate_formula": {
            requireParam(config, "config", "validate_formula");
            let configObj: unknown;
            try {
              configObj = JSON.parse(config);
            } catch (e) {
              return { content: [{ type: "text" as const, text: `Invalid JSON in config parameter: ${(e as Error).message}` }], isError: true };
            }
            const result = await client.post(`/worksheets/${encodeURIComponent(worksheetId)}/validate-formula`, configObj);
            return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
          }

          case "generate_ia_input": {
            requireParam(config, "config", "generate_ia_input");
            let configObj: unknown;
            try {
              configObj = JSON.parse(config);
            } catch (e) {
              return { content: [{ type: "text" as const, text: `Invalid JSON in config parameter: ${(e as Error).message}` }], isError: true };
            }
            const result = await client.post(`/worksheets/${encodeURIComponent(worksheetId)}/generate-ia-input`, configObj);
            return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
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