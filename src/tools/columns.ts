import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GridClient } from "../client.js";
import { z } from "zod";
import { ColumnInputSchema, ColumnConfigUnionSchema } from "../schemas.js";
import { configCache } from "../lib/column-config-cache.js";

export function registerColumnTools(server: McpServer, client: GridClient): void {
  server.tool(
    "add_column",
    `Add a new column to a worksheet. The config parameter is a JSON string with the full column configuration.

Column types: AI, Agent, AgentTest, Object, Text, Reference, Formula, Evaluation, PromptTemplate, InvocableAction, Action, DataModelObject

CRITICAL: All configs use nested structure: {"name":"...", "type":"AI", "config":{"type":"AI", "queryResponseFormat":{"type":"EACH_ROW"}, "autoUpdate":true, "config":{"autoUpdate":true, ...type-specific fields...}}}

Common queryResponseFormat values:
- EACH_ROW: Process existing rows (use when worksheet already has data)
- WHOLE_COLUMN with splitByType OBJECT_PER_ROW: Import new data

Example AI column: {"name":"Summary","type":"AI","config":{"type":"AI","queryResponseFormat":{"type":"EACH_ROW"},"autoUpdate":true,"config":{"autoUpdate":true,"mode":"llm","modelConfig":{"modelId":"sfdc_ai__DefaultGPT4Omni","modelName":"sfdc_ai__DefaultGPT4Omni"},"instruction":"Summarize: {$1}","referenceAttributes":[{"columnId":"col-id","columnName":"Source","columnType":"TEXT"}],"responseFormat":{"type":"PLAIN_TEXT","options":[]}}}}

Example Object column: {"name":"Accounts","type":"Object","config":{"type":"Object","queryResponseFormat":{"type":"WHOLE_COLUMN","splitByType":"OBJECT_PER_ROW"},"autoUpdate":true,"config":{"autoUpdate":true,"objectApiName":"Account","fields":[{"name":"Id","type":"ID"},{"name":"Name","type":"STRING"},{"name":"Industry","type":"PICKLIST"}],"filters":[]}}}

IMPORTANT: Object column fields must include "type" with UPPERCASE Salesforce data types (ID, STRING, PICKLIST, CURRENCY, PHONE, URL, TEXTAREA, etc.). Use get_sobject_fields_display to get correct field types.`,
    {
      worksheetId: z.string().describe("The worksheet to add the column to"),
      name: z.string().describe("Column name"),
      type: z.string().describe("Column type: AI, Agent, AgentTest, Formula, Object, PromptTemplate, Action, InvocableAction, Reference, Text, Evaluation, DataModelObject"),
      config: z.string().describe("Full column configuration as a JSON string. Must include name, type, and nested config object. See tool description for structure and examples."),
    },
    async ({ worksheetId, name, type, config }) => {
      try {
        let configObj: unknown;
        try {
          configObj = JSON.parse(config);
        } catch (e) {
          return { content: [{ type: "text" as const, text: `Invalid JSON in config parameter: ${(e as Error).message}` }] };
        }
        let validation = ColumnInputSchema.safeParse(configObj);
        if (!validation.success) {
          // Auto-wrap: if the config is missing the outer type/config wrapper,
          // try wrapping it using the type parameter from the tool call.
          // This handles the common case where LLMs send the inner config directly.
          const obj = configObj as Record<string, unknown>;
          if (obj && typeof obj === 'object') {
            // Case 1: Config has name + config but no outer type wrapper
            // e.g., {"name":"X","config":{"sourceColumnId":"..."}}
            if (obj.config && !obj.type) {
              const wrapped = { ...obj, type, config: { type, config: obj.config } };
              const retry = ColumnInputSchema.safeParse(wrapped);
              if (retry.success) validation = retry;
            }
            // Case 2: Config is just the inner fields (no config nesting at all)
            // e.g., {"name":"X","sourceColumnId":"...","fieldPath":"Name"}
            if (!validation.success && !obj.config) {
              const { name: _n, ...innerFields } = obj;
              const wrapped = { name: name, type, config: { type, config: innerFields } };
              const retry = ColumnInputSchema.safeParse(wrapped);
              if (retry.success) validation = retry;
            }
            // Case 3: Config has type but missing the nested config wrapper
            // e.g., {"name":"X","type":"Reference","sourceColumnId":"..."}
            if (!validation.success && obj.type && !obj.config) {
              const { name: _n, type: _t, ...innerFields } = obj;
              const wrapped = { name: name, type, config: { type, config: innerFields } };
              const retry = ColumnInputSchema.safeParse(wrapped);
              if (retry.success) validation = retry;
            }
          }
          if (!validation.success) {
            const errors = validation.error.issues.map(i => `  ${i.path.join(".")}: ${i.message}`).join("\n");
            return { content: [{ type: "text" as const, text: `Config validation failed:\n${errors}\n\nSee add_column description for correct structure.` }] };
          }
        }
        const body = { name, type, config: validation.data.config };
        const result = await client.post(`/worksheets/${encodeURIComponent(worksheetId)}/columns`, body);
        // Cache the full outer config so typed mutation tools can read it back
        if (result?.id) {
          configCache.set(result.id, validation.data.config);
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );

  server.tool(
    "edit_column",
    "Update a column's configuration AND reprocess all cells with the new config. Use this when changing what the column does (e.g., changing the prompt, model, or references).",
    {
      worksheetId: z.string().describe("The worksheet the column belongs to"),
      columnId: z.string().describe("The ID of the column to edit"),
      config: z.string().describe("JSON string of the updated column config"),
    },
    async ({ worksheetId, columnId, config }) => {
      try {
        let configObj: unknown;
        try {
          configObj = JSON.parse(config);
        } catch (e) {
          return { content: [{ type: "text" as const, text: `Invalid JSON in config parameter: ${(e as Error).message}` }] };
        }
        const validation = ColumnConfigUnionSchema.safeParse(configObj);
        if (!validation.success) {
          const errors = validation.error.issues.map(i => `  ${i.path.join(".")}: ${i.message}`).join("\n");
          return { content: [{ type: "text" as const, text: `Config validation failed:\n${errors}\n\nExpected outer config object with type, queryResponseFormat, autoUpdate, and nested config.` }] };
        }
        const result = await client.put(`/worksheets/${encodeURIComponent(worksheetId)}/columns/${encodeURIComponent(columnId)}`, validation.data);
        // Update cached config after edit
        configCache.set(columnId, validation.data);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );

  server.tool(
    "delete_column",
    "Delete a column from a worksheet.",
    {
      worksheetId: z.string().describe("The worksheet the column belongs to"),
      columnId: z.string().describe("The ID of the column to delete"),
    },
    async ({ columnId, worksheetId }) => {
      try {
        const result = await client.delete(`/worksheets/${encodeURIComponent(worksheetId)}/columns/${encodeURIComponent(columnId)}`);
        configCache.invalidate(columnId);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );

  server.tool(
    "save_column",
    "Save a column's configuration WITHOUT reprocessing cells. Use this when you want to update config but not re-run processing (e.g., renaming a column or adjusting display settings).",
    {
      worksheetId: z.string().describe("The worksheet the column belongs to"),
      columnId: z.string().describe("The ID of the column to save"),
      config: z.string().describe("JSON string of the column config to save"),
    },
    async ({ worksheetId, columnId, config }) => {
      try {
        let configObj: unknown;
        try {
          configObj = JSON.parse(config);
        } catch (e) {
          return { content: [{ type: "text" as const, text: `Invalid JSON in config parameter: ${(e as Error).message}` }] };
        }
        const validation = ColumnConfigUnionSchema.safeParse(configObj);
        if (!validation.success) {
          const errors = validation.error.issues.map(i => `  ${i.path.join(".")}: ${i.message}`).join("\n");
          return { content: [{ type: "text" as const, text: `Config validation failed:\n${errors}\n\nExpected outer config object with type, queryResponseFormat, autoUpdate, and nested config.` }] };
        }
        const result = await client.post(`/worksheets/${encodeURIComponent(worksheetId)}/columns/${encodeURIComponent(columnId)}/save`, validation.data);
        // Update cached config after save
        configCache.set(columnId, validation.data);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );

  server.tool(
    "reprocess_column",
    "Reprocess all cells in a column using the current configuration. Use this when the column config is correct but you want to re-run processing (e.g., after source data changed).",
    {
      worksheetId: z.string().describe("The worksheet the column belongs to"),
      columnId: z.string().describe("The ID of the column to reprocess"),
      config: z.string().describe("JSON string of the column config for reprocessing"),
    },
    async ({ worksheetId, columnId, config }) => {
      try {
        let configObj: unknown;
        try {
          configObj = JSON.parse(config);
        } catch (e) {
          return { content: [{ type: "text" as const, text: `Invalid JSON in config parameter: ${(e as Error).message}` }] };
        }
        const validation = ColumnConfigUnionSchema.safeParse(configObj);
        if (!validation.success) {
          const errors = validation.error.issues.map(i => `  ${i.path.join(".")}: ${i.message}`).join("\n");
          return { content: [{ type: "text" as const, text: `Config validation failed:\n${errors}\n\nExpected outer config object with type, queryResponseFormat, autoUpdate, and nested config.` }] };
        }
        const result = await client.post(`/worksheets/${encodeURIComponent(worksheetId)}/columns/${encodeURIComponent(columnId)}/reprocess`, validation.data);
        // Update cached config after reprocess
        configCache.set(columnId, validation.data);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );

  server.tool(
    "get_column_data",
    "Get all cell data for a specific column. Note: may return 404 in some environments; use get_worksheet_data as fallback.",
    {
      worksheetId: z.string().describe("The worksheet the column belongs to"),
      columnId: z.string().describe("The ID of the column to get data for"),
    },
    async ({ worksheetId, columnId }) => {
      try {
        const result = await client.get(`/worksheets/${encodeURIComponent(worksheetId)}/columns/${encodeURIComponent(columnId)}/data`);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );

  server.tool(
    "create_column_from_utterance",
    "Create a column using natural language. AI will determine the column type and config.",
    {
      worksheetId: z.string().describe("The worksheet to create the column in"),
      utterance: z.string().describe("Natural language description of the column to create"),
    },
    async ({ worksheetId, utterance }) => {
      try {
        const result = await client.post(`/worksheets/${encodeURIComponent(worksheetId)}/create-column-from-utterance`, { utterance });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );

  server.tool(
    "generate_json_path",
    "Generate a JSON path expression for a worksheet.",
    {
      worksheetId: z.string().describe("The worksheet ID"),
      userInput: z.string().describe("User input describing the desired JSON path"),
      variableName: z.string().describe("The variable name to generate a path for"),
      dataType: z.string().describe("The data type of the variable"),
    },
    async ({ worksheetId, userInput, variableName, dataType }) => {
      try {
        const result = await client.post(`/worksheets/${encodeURIComponent(worksheetId)}/generate-json-path`, {
          userInput,
          variableName,
          dataType,
        });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );
}
