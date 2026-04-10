import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GridClient } from "../client.js";
import { getColumnConfig, resolveColumnRef, mergeConfig, getOrFetchColumnConfig } from "../lib/config-helpers.js";
import { resolveModelShorthand } from "../lib/model-map.js";
import { configCache } from "../lib/column-config-cache.js";
import { extractRowIds, getColumnCells } from "../lib/worksheet-data-helpers.js";

/** Helper to build {$N} indexed instruction from {ColumnName} references */
function resolveInstructionRefs(
  instruction: string,
  worksheetColumns: any[]
): { instruction: string; referenceAttributes: any[] } {
  const refPattern = /\{([^}]+)\}/g;
  const refs: any[] = [];
  const seenExprs = new Map<string, number>();

  let resolved = instruction;
  const matches = [...instruction.matchAll(refPattern)];

  for (const match of matches) {
    const rawName = match[1];
    // Skip already-indexed placeholders like {$1}
    if (rawName.startsWith("$")) continue;

    // Handle "ColumnName.FieldName" syntax
    const dotIdx = rawName.indexOf(".");
    const colName = dotIdx >= 0 ? rawName.substring(0, dotIdx) : rawName;
    const fieldName = dotIdx >= 0 ? rawName.substring(dotIdx + 1) : undefined;

    const ref = resolveColumnRef(colName, worksheetColumns);
    if (!ref) continue;

    // Dedup by full expression (columnId + fieldName) so different fields get different indices
    const exprKey = `${ref.columnId}:${fieldName ?? ""}`;
    let idx: number;
    if (seenExprs.has(exprKey)) {
      // Already replaced all occurrences when first seen
      continue;
    } else {
      idx = refs.length + 1;
      seenExprs.set(exprKey, idx);
      refs.push({
        columnId: ref.columnId,
        columnName: ref.columnName,
        columnType: ref.columnType, // PascalCase — matches ColumnTypeEnum in schemas.ts
        ...(fieldName ? { fieldName } : {}),
      });
      // Replace ALL occurrences of this placeholder at once
      resolved = resolved.replaceAll(match[0], `{$${idx}}`);
    }
  }

  return { instruction: resolved, referenceAttributes: refs };
}

/** Standard text response helper */
function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

/** Standard JSON response helper */
function jsonResult(data: unknown) {
  return textResult(JSON.stringify(data, null, 2));
}

/** Standard error response helper */
function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return textResult(`Error: ${message}`);
}

/** Save or reprocess a column based on the reprocess flag */
async function saveOrReprocess(
  client: GridClient,
  worksheetId: string,
  columnId: string,
  config: any,
  reprocess: boolean
): Promise<any> {
  const result = reprocess
    ? await client.put(`/worksheets/${encodeURIComponent(worksheetId)}/columns/${encodeURIComponent(columnId)}`, config)
    : await client.post(`/worksheets/${encodeURIComponent(worksheetId)}/columns/${encodeURIComponent(columnId)}/save`, config);
  // Update cache with the config we just sent
  configCache.set(columnId, config);
  return result;
}

export function registerTypedMutationTools(server: McpServer, client: GridClient): void {
  // =========================================================================
  // 1. edit_ai_prompt
  // =========================================================================
  server.tool(
    "edit_ai_prompt",
    `Modify an AI column's prompt or settings. Fetches the current config, applies your changes,
and reprocesses all cells. Use this instead of edit_column when you want to change what an
AI column does.

Only provide the parameters you want to change -- omitted parameters keep their current values.`,
    {
      columnId: z.string().describe("The AI column to modify"),
      worksheetId: z.string().optional().describe(
        "Worksheet ID containing the column. Providing this avoids scanning all workbooks to find the column."
      ),
      instruction: z.string().optional().describe(
        "New prompt text. Use {ColumnName} to reference other columns. " +
        "Column references are resolved automatically from the worksheet schema."
      ),
      model: z.string().optional().describe(
        "Model shorthand (e.g., 'gpt-4-omni', 'claude-4-sonnet', 'gemini-2.5-flash') or full model ID."
      ),
      responseFormat: z.enum(["plain_text", "single_select"]).optional().describe(
        "Response format type"
      ),
      options: z.array(z.string()).optional().describe(
        "Options for single_select response format (e.g., ['Positive', 'Negative', 'Neutral'])"
      ),
      reprocess: z.boolean().optional().describe(
        "Whether to reprocess cells after updating. Set false to save config without reprocessing."
      ),
    },
    async ({ columnId, worksheetId, instruction, model, responseFormat, options, reprocess: _reprocess }) => {
      const reprocess = _reprocess ?? true;
      try {
        const { column, worksheetId: wsId, worksheetColumns } = await getColumnConfig(client, columnId, worksheetId);
        const outerConfig = await getOrFetchColumnConfig(client, columnId, wsId);
        if (!outerConfig) {
          return textResult(
            `Error: Could not retrieve config for column ${columnId}. Use edit_column or save_column with full config JSON instead.`
          );
        }
        const innerConfig = { ...outerConfig.config };

        if (instruction !== undefined) {
          const resolved = resolveInstructionRefs(instruction, worksheetColumns);
          innerConfig.instruction = resolved.instruction;
          innerConfig.referenceAttributes = resolved.referenceAttributes;
        }

        if (model !== undefined) {
          innerConfig.modelConfig = resolveModelShorthand(model);
        }

        if (responseFormat !== undefined) {
          const formatType = responseFormat === "single_select" ? "SINGLE_SELECT" : "PLAIN_TEXT";
          innerConfig.responseFormat = {
            type: formatType,
            options: formatType === "SINGLE_SELECT" && options
              ? options.map(o => ({ label: o, identifier: o }))
              : innerConfig.responseFormat?.options ?? [],
          };
        } else if (options !== undefined && innerConfig.responseFormat?.type === "SINGLE_SELECT") {
          innerConfig.responseFormat = {
            ...innerConfig.responseFormat,
            options: options.map(o => ({ label: o, identifier: o })),
          };
        }

        const updatedConfig = { ...outerConfig, config: innerConfig };
        const result = await saveOrReprocess(client, wsId, columnId, updatedConfig, reprocess);
        return jsonResult({
          columnId,
          updated: true,
          reprocessing: reprocess,
          result,
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================================
  // 2. edit_agent_config
  // =========================================================================
  server.tool(
    "edit_agent_config",
    `Modify an Agent or AgentTest column's configuration. Fetches the current config, applies
your changes, and reprocesses. Use this to change which agent is being tested, the utterance
template, or context variables.

Only provide the parameters you want to change.`,
    {
      columnId: z.string().describe("The Agent or AgentTest column to modify"),
      worksheetId: z.string().optional().describe(
        "Worksheet ID containing the column. Providing this avoids scanning all workbooks to find the column."
      ),
      agentId: z.string().optional().describe("New agent definition ID"),
      agentVersion: z.string().optional().describe("New agent version ID"),
      utterance: z.string().optional().describe(
        "New utterance template (Agent columns only). Use {ColumnName} for references."
      ),
      contextVariables: z.array(z.object({
        name: z.string().describe("Variable name"),
        value: z.string().optional().describe("Static value"),
        column: z.string().optional().describe("Column name to reference (resolved to columnId)"),
        field: z.string().optional().describe("Field name within the referenced column"),
      })).optional().describe("Context variables. Each must have either 'value' or 'column', not both."),
      isDraft: z.boolean().optional().describe("Test a draft (unpublished) agent version"),
      reprocess: z.boolean().optional().describe(
        "Whether to reprocess cells after updating"
      ),
    },
    async ({ columnId, worksheetId, agentId, agentVersion, utterance, contextVariables, isDraft, reprocess: _reprocess }) => {
      const reprocess = _reprocess ?? true;
      try {
        const { column, worksheetId: wsId, worksheetColumns } = await getColumnConfig(client, columnId, worksheetId);
        const outerConfig = await getOrFetchColumnConfig(client, columnId, wsId);
        if (!outerConfig) {
          return textResult(
            `Error: Could not retrieve config for column ${columnId}. Use edit_column or save_column with full config JSON instead.`
          );
        }
        const innerConfig = { ...outerConfig.config };
        const colType = outerConfig.type ?? column.type; // "Agent" or "AgentTest"

        if (agentId !== undefined) innerConfig.agentId = agentId;
        if (agentVersion !== undefined) innerConfig.agentVersion = agentVersion;
        if (isDraft !== undefined) innerConfig.isDraft = isDraft;

        // Resolve utterance references (Agent columns use "utterance" + "utteranceReferences")
        if (utterance !== undefined && colType === "Agent") {
          const resolved = resolveInstructionRefs(utterance, worksheetColumns);
          innerConfig.utterance = resolved.instruction;
          innerConfig.utteranceReferences = resolved.referenceAttributes;
        }

        // Resolve context variables
        if (contextVariables !== undefined) {
          innerConfig.contextVariables = contextVariables.map(cv => {
            const base: any = { variableName: cv.name };
            if (cv.column) {
              const ref = resolveColumnRef(cv.column, worksheetColumns);
              if (ref) {
                base.reference = {
                  columnId: ref.columnId,
                  columnName: ref.columnName,
                  columnType: ref.columnType,
                  ...(cv.field ? { fieldName: cv.field } : {}),
                };
              }
            } else if (cv.value !== undefined) {
              base.value = cv.value;
            }
            return base;
          });
        }

        const updatedConfig = { ...outerConfig, config: innerConfig };
        const result = await saveOrReprocess(client, wsId, columnId, updatedConfig, reprocess);
        return jsonResult({
          columnId,
          columnType: colType,
          updated: true,
          reprocessing: reprocess,
          result,
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================================
  // 3. add_evaluation
  // =========================================================================
  server.tool(
    "add_evaluation",
    `Add an evaluation column to an existing worksheet. Automatically wires up the input and
reference column references. No need to build the nested config JSON manually.

Supported types: COHERENCE, CONCISENESS, FACTUALITY, INSTRUCTION_FOLLOWING, COMPLETENESS,
RESPONSE_MATCH, TOPIC_ASSERTION, ACTION_ASSERTION, LATENCY_ASSERTION, BOT_RESPONSE_RATING,
EXPRESSION_EVAL, CUSTOM_LLM_EVALUATION.

Types requiring expectedColumn: RESPONSE_MATCH, TOPIC_ASSERTION, ACTION_ASSERTION,
BOT_RESPONSE_RATING, CUSTOM_LLM_EVALUATION.`,
    {
      worksheetId: z.string().describe("The worksheet to add the evaluation to"),
      evaluationType: z.enum([
        "COHERENCE", "CONCISENESS", "FACTUALITY", "INSTRUCTION_FOLLOWING",
        "COMPLETENESS", "RESPONSE_MATCH", "TOPIC_ASSERTION", "ACTION_ASSERTION",
        "LATENCY_ASSERTION", "BOT_RESPONSE_RATING", "EXPRESSION_EVAL",
        "CUSTOM_LLM_EVALUATION"
      ]).describe("The evaluation type"),
      targetColumn: z.string().describe(
        "Name or ID of the column to evaluate (typically an Agent, AgentTest, or PromptTemplate column)"
      ),
      expectedColumn: z.string().optional().describe(
        "Name or ID of the column with expected values (required for comparison evaluations)"
      ),
      name: z.string().optional().describe(
        "Display name for the evaluation column. Defaults to the evaluation type in title case."
      ),
      expressionFormula: z.string().optional().describe(
        "Formula for EXPRESSION_EVAL type (e.g., \"{response.topicName} == 'Service'\")"
      ),
      customEvalTemplate: z.string().optional().describe(
        "Prompt template API name for CUSTOM_LLM_EVALUATION type"
      ),
    },
    async ({ worksheetId, evaluationType, targetColumn, expectedColumn, name, expressionFormula, customEvalTemplate }) => {
      try {
        const wsData = await client.get(`/worksheets/${encodeURIComponent(worksheetId)}/data`);
        const columns = wsData.columns || [];

        const REFERENCE_EVALS = new Set([
          "RESPONSE_MATCH", "TOPIC_ASSERTION", "ACTION_ASSERTION",
          "BOT_RESPONSE_RATING", "CUSTOM_LLM_EVALUATION",
        ]);

        // Resolve target column
        const targetRef = resolveColumnRef(targetColumn, columns);
        if (!targetRef) {
          return textResult(`Error: Target column "${targetColumn}" not found in worksheet.`);
        }

        // Resolve expected column if needed
        let expectedRef: ReturnType<typeof resolveColumnRef> = null;
        if (REFERENCE_EVALS.has(evaluationType)) {
          if (!expectedColumn) {
            return textResult(
              `Error: Evaluation type ${evaluationType} requires an expectedColumn parameter.`
            );
          }
          expectedRef = resolveColumnRef(expectedColumn, columns);
          if (!expectedRef) {
            return textResult(`Error: Expected column "${expectedColumn}" not found in worksheet.`);
          }
        }

        const displayName = name ?? evaluationType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

        const innerConfig: any = {
          autoUpdate: true,
          evaluationType,
          inputColumnReference: {
            columnId: targetRef.columnId,
            columnName: targetRef.columnName,
            columnType: targetRef.columnType,
          },
          autoEvaluate: true,
        };

        if (expectedRef) {
          innerConfig.referenceColumnReference = {
            columnId: expectedRef.columnId,
            columnName: expectedRef.columnName,
            columnType: expectedRef.columnType,
          };
        }

        if (evaluationType === "EXPRESSION_EVAL" && expressionFormula) {
          innerConfig.expressionFormula = expressionFormula;
          innerConfig.expressionReturnType = "Boolean";
        }

        if (evaluationType === "CUSTOM_LLM_EVALUATION" && customEvalTemplate) {
          innerConfig.customEvaluation = {
            type: "CUSTOM_LLM_EVALUATION",
            instruction: customEvalTemplate,
          };
        }

        const body = {
          name: displayName,
          type: "Evaluation",
          config: {
            type: "Evaluation",
            queryResponseFormat: { type: "EACH_ROW" },
            autoUpdate: true,
            config: innerConfig,
          },
        };

        const result = await client.post(
          `/worksheets/${encodeURIComponent(worksheetId)}/columns`,
          body
        );

        // Cache the outer config so typed mutation tools can read it back
        if (result?.id) {
          configCache.set(result.id, body.config);
        }

        return jsonResult({
          columnId: result.id,
          name: displayName,
          evaluationType,
          targetColumn: targetRef.columnName,
          expectedColumn: expectedRef?.columnName ?? null,
          result,
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================================
  // 4. change_model
  // =========================================================================
  server.tool(
    "change_model",
    `Change the LLM model used by an AI or PromptTemplate column. Accepts model shorthands
(e.g., 'gpt-4-omni', 'claude-4-sonnet') or full model IDs. Reprocesses all cells with the new model.`,
    {
      columnId: z.string().describe("The column to change the model for"),
      worksheetId: z.string().optional().describe(
        "Worksheet ID containing the column. Providing this avoids scanning all workbooks to find the column."
      ),
      model: z.string().describe(
        "Model shorthand or full model ID (e.g., 'gpt-4-omni', 'sfdc_ai__DefaultGPT4Omni')"
      ),
      reprocess: z.boolean().optional().describe(
        "Whether to reprocess cells after changing. Set false to just save."
      ),
    },
    async ({ columnId, worksheetId, model, reprocess: _reprocess }) => {
      const reprocess = _reprocess ?? true;
      try {
        const { column, worksheetId: wsId } = await getColumnConfig(client, columnId, worksheetId);
        const outerConfig = await getOrFetchColumnConfig(client, columnId, wsId);
        if (!outerConfig) {
          return textResult(
            `Error: Could not retrieve config for column ${columnId}. Use edit_column or save_column with full config JSON instead.`
          );
        }
        const colType = outerConfig.type ?? column.type;

        if (colType !== "AI" && colType !== "PromptTemplate") {
          return textResult(
            `Error: change_model only works on AI or PromptTemplate columns (this column is ${colType}).`
          );
        }

        const modelConfig = resolveModelShorthand(model);
        const innerConfig = { ...outerConfig.config, modelConfig };
        const updatedConfig = { ...outerConfig, config: innerConfig };

        const previousModel = outerConfig.config?.modelConfig?.modelId ?? "unknown";
        const result = await saveOrReprocess(client, wsId, columnId, updatedConfig, reprocess);

        return jsonResult({
          columnId,
          updated: true,
          reprocessing: reprocess,
          previousModel,
          newModel: modelConfig.modelId,
          result,
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================================
  // 5. update_filters
  // =========================================================================
  server.tool(
    "update_filters",
    `Update the query filters on an Object or DataModelObject column. Replaces the existing
filters with the new set. Reprocesses to re-query with new filters.

For SOQL/DCSQL advanced mode, use edit_column directly.`,
    {
      columnId: z.string().describe("The Object or DataModelObject column to update"),
      worksheetId: z.string().optional().describe(
        "Worksheet ID containing the column. Providing this avoids scanning all workbooks to find the column."
      ),
      filters: z.array(z.object({
        field: z.string().describe("Field API name to filter on"),
        operator: z.enum([
          "In", "NotIn", "EqualTo", "NotEqualTo", "Contains", "StartsWith",
          "EndsWith", "IsNull", "IsNotNull", "LessThan", "LessThanOrEqualTo",
          "GreaterThan", "GreaterThanOrEqualTo"
        ]).describe("Filter operator"),
        values: z.array(z.string()).optional().describe(
          "Filter values (not needed for IsNull/IsNotNull)"
        ),
      })).describe("New filter conditions"),
      reprocess: z.boolean().optional().describe(
        "Whether to reprocess after updating filters"
      ),
    },
    async ({ columnId, worksheetId, filters, reprocess: _reprocess }) => {
      const reprocess = _reprocess ?? true;
      try {
        const { column, worksheetId: wsId } = await getColumnConfig(client, columnId, worksheetId);
        const outerConfig = await getOrFetchColumnConfig(client, columnId, wsId);
        if (!outerConfig) {
          return textResult(
            `Error: Could not retrieve config for column ${columnId}. Use edit_column or save_column with full config JSON instead.`
          );
        }
        const colType = outerConfig.type ?? column.type;

        if (colType !== "Object" && colType !== "DataModelObject") {
          return textResult(
            `Error: update_filters only works on Object or DataModelObject columns (this column is ${colType}).`
          );
        }

        // Build typed filter objects
        const typedFilters = filters.map(f => ({
          field: f.field,
          operator: f.operator,
          values: f.values?.map(v => ({ value: v, type: "string" })),
        }));

        const innerConfig = { ...outerConfig.config, filters: typedFilters };
        const updatedConfig = { ...outerConfig, config: innerConfig };

        const result = await saveOrReprocess(client, wsId, columnId, updatedConfig, reprocess);
        return jsonResult({
          columnId,
          updated: true,
          reprocessing: reprocess,
          filterCount: filters.length,
          result,
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================================
  // 6. reprocess
  // =========================================================================
  server.tool(
    "reprocess",
    `Reprocess cells in a column or worksheet. Use this after source data changes, or to retry
failed cells without changing any configuration.

Scope options:
- Provide columnId to reprocess a single column
- Provide worksheetId to reprocess all processing columns in the worksheet
- Use 'filter' to limit which cells are reprocessed`,
    {
      columnId: z.string().optional().describe("Reprocess a single column"),
      worksheetId: z.string().optional().describe(
        "Reprocess all processing columns in this worksheet"
      ),
      filter: z.enum(["all", "failed", "stale"]).optional().describe(
        "Which cells to reprocess: 'all' (default), 'failed' (only Error cells), " +
        "'stale' (cells whose source data changed)"
      ),
    },
    async ({ columnId, worksheetId, filter: _filter }) => {
      const filter = _filter ?? "all";
      try {
        if (!columnId && !worksheetId) {
          return textResult("Error: Must provide either columnId or worksheetId.");
        }
        // When both are provided, use columnId as the scope and worksheetId as a hint
        // to avoid scanning all workbooks to find the column.

        const PROCESSING_TYPES = new Set([
          "AI", "Agent", "AgentTest", "Evaluation", "PromptTemplate",
          "Object", "DataModelObject", "InvocableAction", "Formula",
        ]);

        if (columnId) {
          // Single column reprocess
          const { column, worksheetId: wsId } = await getColumnConfig(client, columnId, worksheetId);
          const cachedConfig = await getOrFetchColumnConfig(client, columnId, wsId);
          if (!cachedConfig) {
            return textResult(
              `Error: Could not retrieve config for column ${columnId}. ` +
              `Use the raw reprocess_column tool instead, providing the full config JSON.`
            );
          }

          if (filter === "all") {
            const result = await client.post(
              `/worksheets/${encodeURIComponent(wsId)}/columns/${encodeURIComponent(columnId)}/reprocess`,
              cachedConfig
            );
            return jsonResult({ reprocessed: "all", columnId, result });
          }

          // For failed/stale: find specific row IDs
          const wsData = await client.get(`/worksheets/${encodeURIComponent(wsId)}/data`);
          const cells = getColumnCells(wsData, columnId);
          if (cells.length === 0) return textResult(`Error: Column ${columnId} cells not found.`);

          const targetStatus = filter === "failed" ? "Error" : "New";
          const matchingRowIds: string[] = cells
            .filter((c: any) => c.status === targetStatus)
            .map((c: any) => c.worksheetRowId)
            .filter(Boolean);

          if (matchingRowIds.length === 0) {
            return jsonResult({
              reprocessed: 0,
              columnId,
              filter,
              message: `No ${filter} cells found.`,
            });
          }

          const result = await client.post(
            `/worksheets/${encodeURIComponent(wsId)}/trigger-row-execution`,
            { trigger: "RUN_ROW", rowIds: matchingRowIds }
          );

          return jsonResult({
            reprocessed: matchingRowIds.length,
            columnId,
            filter,
            message: `Reprocessing ${matchingRowIds.length} ${filter} cells.`,
            result,
          });
        }

        // Worksheet-level reprocess
        const wsData = await client.get(`/worksheets/${encodeURIComponent(worksheetId!)}/data`);
        const columns = wsData.columns || [];
        const processingCols = columns.filter((c: any) => PROCESSING_TYPES.has(c.config?.type ?? c.type));

        if (filter === "all") {
          const results: any[] = [];
          const skipped: string[] = [];
          for (const col of processingCols) {
            const cached = configCache.get(col.id);
            if (!cached) {
              skipped.push(col.name ?? col.id);
              continue;
            }
            const result = await client.post(
              `/worksheets/${encodeURIComponent(worksheetId!)}/columns/${encodeURIComponent(col.id)}/reprocess`,
              cached
            );
            results.push({ columnId: col.id, name: col.name, result });
          }
          return jsonResult({
            reprocessed: "all",
            worksheetId,
            columnsReprocessed: results.length,
            ...(skipped.length > 0 ? { skippedNoCache: skipped } : {}),
            results,
          });
        }

        // For failed/stale at worksheet level: find all affected row IDs
        const targetStatus = filter === "failed" ? "Error" : "New";
        const matchingRowIds = new Set<string>();

        for (const col of processingCols) {
          const cells = getColumnCells(wsData, col.id);
          for (const cell of cells) {
            if (cell.status === targetStatus && cell.worksheetRowId) {
              matchingRowIds.add(cell.worksheetRowId);
            }
          }
        }

        if (matchingRowIds.size === 0) {
          return jsonResult({
            reprocessed: 0,
            worksheetId,
            filter,
            message: `No ${filter} cells found in any processing column.`,
          });
        }

        const result = await client.post(
          `/worksheets/${encodeURIComponent(worksheetId!)}/trigger-row-execution`,
          { trigger: "RUN_ROW", rowIds: [...matchingRowIds] }
        );

        return jsonResult({
          reprocessed: matchingRowIds.size,
          worksheetId,
          filter,
          message: `Reprocessing ${matchingRowIds.size} rows with ${filter} cells.`,
          result,
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // =========================================================================
  // 7. edit_prompt_template
  // =========================================================================
  server.tool(
    "edit_prompt_template",
    `Modify a PromptTemplate column's template selection or input mappings. Use this to switch
which prompt template is used or to rewire the input variables.`,
    {
      columnId: z.string().describe("The PromptTemplate column to modify"),
      worksheetId: z.string().optional().describe(
        "Worksheet ID containing the column. Providing this avoids scanning all workbooks to find the column."
      ),
      templateName: z.string().optional().describe("New prompt template developer name"),
      inputMappings: z.array(z.object({
        variable: z.string().describe("Template variable name (referenceName)"),
        column: z.string().describe("Column name to map to this variable"),
        field: z.string().optional().describe("Field name within the column"),
      })).optional().describe("Input variable to column mappings"),
      model: z.string().optional().describe("Model shorthand or full ID"),
      reprocess: z.boolean().optional().describe(
        "Whether to reprocess cells after updating"
      ),
    },
    async ({ columnId, worksheetId, templateName, inputMappings, model, reprocess: _reprocess }) => {
      const reprocess = _reprocess ?? true;
      try {
        const { column, worksheetId: wsId, worksheetColumns } = await getColumnConfig(client, columnId, worksheetId);
        const outerConfig = await getOrFetchColumnConfig(client, columnId, wsId);
        if (!outerConfig) {
          return textResult(
            `Error: Could not retrieve config for column ${columnId}. Use edit_column or save_column with full config JSON instead.`
          );
        }
        const innerConfig = { ...outerConfig.config };
        const colType = outerConfig.type ?? column.type;

        if (colType !== "PromptTemplate") {
          return textResult(
            `Error: edit_prompt_template only works on PromptTemplate columns (this column is ${colType}).`
          );
        }

        if (templateName !== undefined) {
          innerConfig.promptTemplateDevName = templateName;
        }

        if (model !== undefined) {
          innerConfig.modelConfig = resolveModelShorthand(model);
        }

        if (inputMappings !== undefined) {
          innerConfig.promptTemplateInputConfigs = inputMappings.map(mapping => {
            const ref = resolveColumnRef(mapping.column, worksheetColumns);
            const config: any = {
              referenceName: mapping.variable,
            };
            if (ref) {
              config.referenceAttribute = {
                columnId: ref.columnId,
                columnName: ref.columnName,
                columnType: ref.columnType,
                ...(mapping.field ? { fieldName: mapping.field } : {}),
              };
            }
            return config;
          });
        }

        const updatedConfig = { ...outerConfig, config: innerConfig };
        const result = await saveOrReprocess(client, wsId, columnId, updatedConfig, reprocess);

        return jsonResult({
          columnId,
          updated: true,
          reprocessing: reprocess,
          result,
        });
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
