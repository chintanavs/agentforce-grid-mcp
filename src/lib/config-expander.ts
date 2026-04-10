/**
 * Config expander: transforms flat YAML ColumnSpec into triple-nested GCC JSON
 * that passes ColumnConfigUnionSchema.parse().
 */

import { z } from "zod";
import { ColumnInputSchema, ColumnConfigUnionSchema } from "../schemas.js";
import { resolveModelShorthand } from "./model-map.js";
import type { ColumnSpec } from "./yaml-parser.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ColumnMapEntry {
  id: string;
  name: string;
  type: string; // API PascalCase type (AI, Object, AgentTest, etc.)
}

export interface ExpansionContext {
  columnMap: Map<string, ColumnMapEntry>;
  defaults: { numberOfRows: number; model: string };
  resolveModel: (shorthand: string) => { modelId: string; modelName: string };
}

// ---------------------------------------------------------------------------
// Column type -> referenceAttribute columnType mapping
// ---------------------------------------------------------------------------

/** Maps API type names to the values accepted by ColumnTypeEnum in schemas.ts (PascalCase). */
const REF_TYPE_MAP: Record<string, string> = {
  AI: "AI",
  Agent: "Agent",
  AgentTest: "AgentTest",
  Object: "Object",
  DataModelObject: "DataModelObject",
  Text: "Text",
  Reference: "Reference",
  Formula: "Formula",
  PromptTemplate: "PromptTemplate",
  InvocableAction: "InvocableAction",
  Action: "Action",
  Evaluation: "Evaluation",
};

// Filter operator shorthand -> API PascalCase
const FILTER_OP_MAP: Record<string, string> = {
  in: "In",
  not_in: "NotIn",
  eq: "EqualTo",
  neq: "NotEqualTo",
  contains: "Contains",
  starts_with: "StartsWith",
  ends_with: "EndsWith",
  is_null: "IsNull",
  is_not_null: "IsNotNull",
  lt: "LessThan",
  lte: "LessThanOrEqualTo",
  gt: "GreaterThan",
  gte: "GreaterThanOrEqualTo",
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function expandColumnConfig(
  yamlCol: ColumnSpec,
  ctx: ExpansionContext,
): z.infer<typeof ColumnInputSchema> {
  const colType = yamlCol.type; // Already API PascalCase from yaml-parser
  const innerConfig = buildInnerConfig(yamlCol, colType, ctx);
  const qrf = inferQueryResponseFormat(yamlCol, colType);
  const numberOfRows = (yamlCol.numberOfRows as number | undefined) ?? ctx.defaults.numberOfRows;

  const outerConfig: Record<string, unknown> = {
    type: colType,
    autoUpdate: true,
    config: { autoUpdate: true, ...innerConfig },
  };

  if (qrf) {
    outerConfig.queryResponseFormat = qrf;
  }

  // numberOfRows on the outer config for types that use it
  if (colType !== "Text" || yamlCol.documentId) {
    outerConfig.numberOfRows = numberOfRows;
  }

  // Validate against the Zod schema
  const parseResult = ColumnConfigUnionSchema.safeParse(outerConfig);
  if (!parseResult.success) {
    const issues = parseResult.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Config expansion failed for column "${yamlCol.name}" (type: ${colType}):\n${issues}`,
    );
  }

  return {
    name: yamlCol.name,
    type: colType as z.infer<typeof ColumnInputSchema>["type"],
    config: parseResult.data,
  };
}

// ---------------------------------------------------------------------------
// queryResponseFormat inference
// ---------------------------------------------------------------------------

function inferQueryResponseFormat(
  yamlCol: ColumnSpec,
  colType: string,
): { type: string; splitByType?: string } | undefined {
  if (colType === "Object" || colType === "DataModelObject") {
    return { type: "WHOLE_COLUMN", splitByType: "OBJECT_PER_ROW" };
  }
  if (colType === "Text" && yamlCol.documentId) {
    return { type: "WHOLE_COLUMN", splitByType: "OBJECT_PER_ROW" };
  }
  if (colType === "Text") {
    return undefined;
  }
  return { type: "EACH_ROW" };
}

// ---------------------------------------------------------------------------
// Inner config builders by type
// ---------------------------------------------------------------------------

function buildInnerConfig(
  col: ColumnSpec,
  colType: string,
  ctx: ExpansionContext,
): Record<string, unknown> {
  switch (colType) {
    case "AI":
      return buildAIConfig(col, ctx);
    case "Agent":
      return buildAgentConfig(col, ctx);
    case "AgentTest":
      return buildAgentTestConfig(col, ctx);
    case "Object":
      return buildObjectConfig(col);
    case "DataModelObject":
      return buildDataModelObjectConfig(col);
    case "Evaluation":
      return buildEvaluationConfig(col, ctx);
    case "Reference":
      return buildReferenceConfig(col, ctx);
    case "Formula":
      return buildFormulaConfig(col, ctx);
    case "PromptTemplate":
      return buildPromptTemplateConfig(col, ctx);
    case "InvocableAction":
      return buildInvocableActionConfig(col, ctx);
    case "Action":
      return buildActionConfig(col, ctx);
    case "Text":
      return buildTextConfig(col);
    default:
      throw new Error(`Unknown column type: ${colType}`);
  }
}

// ---------------------------------------------------------------------------
// Placeholder rewriting: {ColumnName} and {ColumnName.FieldName} -> {$N}
// ---------------------------------------------------------------------------

interface RewriteResult {
  rewritten: string;
  referenceAttributes: Array<{
    columnId: string;
    columnName: string;
    columnType: string;
    fieldName?: string;
  }>;
}

function rewritePlaceholders(text: string, ctx: ExpansionContext): RewriteResult {
  const refs: RewriteResult["referenceAttributes"] = [];
  const seenRefs = new Map<string, string>(); // "ColName.Field" -> "{$N}"
  let index = 1;

  const rewritten = text.replace(/\{([^}$]+)\}/g, (_match, refExpr: string) => {
    // Skip if already seen (dedup)
    if (seenRefs.has(refExpr)) {
      return seenRefs.get(refExpr)!;
    }

    const dotIdx = refExpr.indexOf(".");
    const columnName = dotIdx >= 0 ? refExpr.slice(0, dotIdx) : refExpr;
    const fieldName = dotIdx >= 0 ? refExpr.slice(dotIdx + 1) : undefined;

    const entry = ctx.columnMap.get(columnName);
    if (!entry) {
      throw new Error(
        `Column "${columnName}" referenced in placeholder "{${refExpr}}" not found in column map`,
      );
    }

    const placeholder = `{$${index}}`;
    seenRefs.set(refExpr, placeholder);

    refs.push({
      columnId: entry.id,
      columnName: entry.name,
      columnType: REF_TYPE_MAP[entry.type] ?? entry.type,
      ...(fieldName ? { fieldName } : {}),
    });

    index++;
    return placeholder;
  });

  return { rewritten, referenceAttributes: refs };
}

// ---------------------------------------------------------------------------
// Build a referenceAttribute for a single column name reference
// ---------------------------------------------------------------------------

function buildColumnRef(
  columnName: string,
  ctx: ExpansionContext,
  fieldName?: string,
): { columnId: string; columnName: string; columnType: string; fieldName?: string } {
  const entry = ctx.columnMap.get(columnName);
  if (!entry) {
    throw new Error(`Referenced column "${columnName}" not found in column map`);
  }
  return {
    columnId: entry.id,
    columnName: entry.name,
    columnType: REF_TYPE_MAP[entry.type] ?? entry.type,
    ...(fieldName ? { fieldName } : {}),
  };
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

function buildAIConfig(col: ColumnSpec, ctx: ExpansionContext): Record<string, unknown> {
  const instruction = col.instruction as string;
  const { rewritten, referenceAttributes } = rewritePlaceholders(instruction, ctx);

  const modelShorthand = (col.model as string | undefined) ?? ctx.defaults.model;
  const modelConfig = ctx.resolveModel(modelShorthand);

  const config: Record<string, unknown> = {
    mode: "llm",
    modelConfig,
    instruction: rewritten,
  };

  if (referenceAttributes.length > 0) {
    config.referenceAttributes = referenceAttributes;
  }

  config.responseFormat = expandResponseFormat(col.responseFormat);

  return config;
}

function expandResponseFormat(
  rf: unknown,
): { type: string; outputExample?: string; options?: Array<{ label: string; identifier?: string }> } {
  if (rf === undefined || rf === null || rf === "plain_text") {
    return { type: "PLAIN_TEXT" };
  }

  if (typeof rf === "string") {
    if (rf === "single_select") {
      return { type: "SINGLE_SELECT" };
    }
    return { type: rf.toUpperCase() };
  }

  if (typeof rf === "object" && rf !== null) {
    const obj = rf as Record<string, unknown>;
    const result: Record<string, unknown> = {
      type: ((obj.type as string) ?? "plain_text").toUpperCase(),
    };

    if (obj.outputExample) {
      result.outputExample = obj.outputExample;
    }

    if (Array.isArray(obj.options)) {
      result.options = (obj.options as unknown[]).map((opt) => {
        if (typeof opt === "string") {
          return { label: opt };
        }
        return opt;
      });
    }

    return result as ReturnType<typeof expandResponseFormat>;
  }

  return { type: "PLAIN_TEXT" };
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

function buildAgentConfig(col: ColumnSpec, ctx: ExpansionContext): Record<string, unknown> {
  const agentId = col.agentId as string;
  const agentVersion = col.agentVersion as string | undefined;
  const utterance = col.utterance as string;

  const { rewritten, referenceAttributes } = rewritePlaceholders(utterance, ctx);

  const config: Record<string, unknown> = {
    agentId,
    utterance: rewritten,
  };

  if (agentVersion) {
    config.agentVersion = agentVersion;
  }

  if (referenceAttributes.length > 0) {
    config.utteranceReferences = referenceAttributes;
  }

  // Context variables
  if (col.contextVariables) {
    config.contextVariables = expandContextVariables(
      col.contextVariables as Record<string, unknown>,
      ctx,
    );
  }

  // Conversation history / initial state
  if (col.conversationHistory) {
    config.conversationHistory = buildColumnRef(col.conversationHistory as string, ctx);
  }
  if (col.initialState) {
    config.initialState = buildColumnRef(col.initialState as string, ctx);
  }

  return config;
}

// ---------------------------------------------------------------------------
// AgentTest
// ---------------------------------------------------------------------------

function buildAgentTestConfig(col: ColumnSpec, ctx: ExpansionContext): Record<string, unknown> {
  const agentId = col.agentId as string;
  const agentVersion = col.agentVersion as string | undefined;
  const inputUtteranceCol = col.inputUtterance as string;

  const config: Record<string, unknown> = {
    agentId,
    inputUtterance: buildColumnRef(inputUtteranceCol, ctx),
    contextVariables: col.contextVariables
      ? expandContextVariables(col.contextVariables as Record<string, unknown>, ctx)
      : [],
    isDraft: (col.isDraft as boolean) ?? false,
    enableSimulationMode: (col.enableSimulationMode as boolean) ?? false,
  };

  if (agentVersion) {
    config.agentVersion = agentVersion;
  }

  if (col.conversationHistory) {
    config.conversationHistory = buildColumnRef(col.conversationHistory as string, ctx);
  }
  if (col.initialState) {
    config.initialState = buildColumnRef(col.initialState as string, ctx);
  }

  return config;
}

// ---------------------------------------------------------------------------
// Context variable expansion (shared by Agent/AgentTest)
// ---------------------------------------------------------------------------

function expandContextVariables(
  vars: Record<string, unknown>,
  ctx: ExpansionContext,
): Array<Record<string, unknown>> {
  return Object.entries(vars).map(([variableName, value]) => {
    if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
      // Column reference: {ColumnName} or {ColumnName.FieldName}
      const refExpr = value.slice(1, -1);
      const dotIdx = refExpr.indexOf(".");
      const columnName = dotIdx >= 0 ? refExpr.slice(0, dotIdx) : refExpr;
      const fieldName = dotIdx >= 0 ? refExpr.slice(dotIdx + 1) : undefined;

      return {
        variableName,
        type: "Text",
        reference: buildColumnRef(columnName, ctx, fieldName),
      };
    }

    // Static value
    return {
      variableName,
      type: "Text",
      value,
    };
  });
}

// ---------------------------------------------------------------------------
// Object
// ---------------------------------------------------------------------------

function buildObjectConfig(col: ColumnSpec): Record<string, unknown> {
  const config: Record<string, unknown> = {
    objectApiName: col.object as string,
    fields: expandFields(col.fields as unknown[]),
  };

  if (col.filters) {
    config.filters = expandFilters(col.filters as unknown[]);
  }

  if (col.soql) {
    config.advancedMode = {
      type: "SOQL",
      inputs: { query: col.soql as string },
    };
  }

  return config;
}

// ---------------------------------------------------------------------------
// DataModelObject
// ---------------------------------------------------------------------------

function buildDataModelObjectConfig(col: ColumnSpec): Record<string, unknown> {
  const config: Record<string, unknown> = {
    dataModelObjectApiName: col.dmo as string,
    dataspaceName: col.dataspace as string,
    fields: expandFields(col.fields as unknown[]),
  };

  if (col.filters) {
    config.filters = expandFilters(col.filters as unknown[]);
  }

  if (col.dcsql) {
    config.advancedMode = {
      type: "DCSQL",
      inputs: { query: col.dcsql as string },
    };
  }

  return config;
}

// ---------------------------------------------------------------------------
// Fields and filters (shared by Object/DataModelObject)
// ---------------------------------------------------------------------------

function expandFields(
  fields: unknown[],
): Array<{ name: string; type?: string }> {
  return fields.map((f) => {
    if (typeof f === "string") {
      return { name: f, type: "string" };
    }
    if (typeof f === "object" && f !== null) {
      // { FieldName: type } format
      const entries = Object.entries(f as Record<string, unknown>);
      if (entries.length === 1) {
        const [name, type] = entries[0];
        return { name, type: String(type) };
      }
      // Already a {name, type} object
      return f as { name: string; type?: string };
    }
    return { name: String(f), type: "string" };
  });
}

function expandFilters(
  filters: unknown[],
): Array<{ field: string; operator: string; values?: unknown[] }> {
  return (filters as Array<Record<string, unknown>>).map((f) => {
    const operator = resolveFilterOperator(f.operator as string);
    const result: Record<string, unknown> = {
      field: f.field as string,
      operator,
    };

    if (f.values !== undefined) {
      result.values = (f.values as unknown[]).map((v) => v);
    }

    return result as { field: string; operator: string; values?: unknown[] };
  });
}

function resolveFilterOperator(op: string): string {
  // Check the shorthand map (case-insensitive)
  const lower = op.toLowerCase();
  if (FILTER_OP_MAP[lower]) {
    return FILTER_OP_MAP[lower];
  }
  // Already PascalCase
  return op;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

function buildEvaluationConfig(col: ColumnSpec, ctx: ExpansionContext): Record<string, unknown> {
  const inputColName = col.input as string;
  const referenceColName = col.reference as string | undefined;

  const config: Record<string, unknown> = {
    inputColumnReference: buildColumnRef(inputColName, ctx),
    autoEvaluate: (col.autoEvaluate as boolean) ?? true,
  };

  // evaluationType from eval/* shorthand or explicit
  if (col.evaluationType) {
    config.evaluationType = col.evaluationType as string;
  }

  if (referenceColName) {
    config.referenceColumnReference = buildColumnRef(referenceColName, ctx);
  }

  // Expression evaluation fields
  if (col.formula) {
    config.expressionFormula = col.formula as string;
    config.expressionReturnType = (col.returnType as string) ?? "boolean";
  }

  // Custom evaluation
  if (col.customEvaluation) {
    config.customEvaluation = col.customEvaluation;
  }

  return config;
}

// ---------------------------------------------------------------------------
// Reference
// ---------------------------------------------------------------------------

function buildReferenceConfig(col: ColumnSpec, ctx: ExpansionContext): Record<string, unknown> {
  const sourceColName = col.source as string;
  const entry = ctx.columnMap.get(sourceColName);
  if (!entry) {
    throw new Error(`Referenced source column "${sourceColName}" not found in column map`);
  }

  return {
    referenceColumnId: entry.id,
    referenceField: col.field as string,
  };
}

// ---------------------------------------------------------------------------
// Formula
// ---------------------------------------------------------------------------

function buildFormulaConfig(col: ColumnSpec, ctx: ExpansionContext): Record<string, unknown> {
  const formula = col.formula as string;
  const { rewritten, referenceAttributes } = rewritePlaceholders(formula, ctx);

  const config: Record<string, unknown> = {
    formula: rewritten,
  };

  if (col.returnType) {
    config.returnType = col.returnType as string;
  }

  if (referenceAttributes.length > 0) {
    config.referenceAttributes = referenceAttributes;
  }

  return config;
}

// ---------------------------------------------------------------------------
// PromptTemplate
// ---------------------------------------------------------------------------

function buildPromptTemplateConfig(col: ColumnSpec, ctx: ExpansionContext): Record<string, unknown> {
  const modelShorthand = (col.model as string | undefined) ?? ctx.defaults.model;
  const modelConfig = ctx.resolveModel(modelShorthand);

  const config: Record<string, unknown> = {
    promptTemplateDevName: col.template as string,
    modelConfig,
  };

  if (col.templateType) {
    config.promptTemplateType = col.templateType as string;
  }

  // Map inputs to promptTemplateInputConfigs
  if (col.inputs) {
    const inputs = col.inputs as Record<string, unknown>;
    config.promptTemplateInputConfigs = Object.entries(inputs).map(
      ([referenceName, value]) => {
        const inputConfig: Record<string, unknown> = { referenceName };

        if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
          const refExpr = value.slice(1, -1);
          const dotIdx = refExpr.indexOf(".");
          const columnName = dotIdx >= 0 ? refExpr.slice(0, dotIdx) : refExpr;
          const fieldName = dotIdx >= 0 ? refExpr.slice(dotIdx + 1) : undefined;
          inputConfig.referenceAttribute = buildColumnRef(columnName, ctx, fieldName);
        } else if (value !== undefined && value !== null) {
          // Static value — pass through as definition
          inputConfig.definition = String(value);
        }

        return inputConfig;
      },
    );
  }

  return config;
}

// ---------------------------------------------------------------------------
// InvocableAction
// ---------------------------------------------------------------------------

function buildInvocableActionConfig(col: ColumnSpec, ctx: ExpansionContext): Record<string, unknown> {
  const action = col.action as Record<string, unknown>;

  const config: Record<string, unknown> = {
    actionInfo: {
      actionName: action.name as string,
      actionType: action.type as string,
    },
  };

  // Build payload with placeholder rewriting
  if (col.payload) {
    const payloadObj = col.payload as Record<string, unknown>;
    const payloadStr = JSON.stringify(payloadObj);
    const { rewritten, referenceAttributes } = rewritePlaceholders(payloadStr, ctx);
    config.inputPayload = rewritten;

    if (referenceAttributes.length > 0) {
      config.referenceAttributes = referenceAttributes;
    }
  }

  return config;
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

function buildActionConfig(col: ColumnSpec, ctx: ExpansionContext): Record<string, unknown> {
  const config: Record<string, unknown> = {
    actionName: col.actionName as string,
  };

  if (col.inputs) {
    const inputs = col.inputs as Record<string, unknown>;
    const fieldUpdateConfigs: Array<Record<string, unknown>> = [];

    for (const [fieldName, value] of Object.entries(inputs)) {
      if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
        const colName = value.slice(1, -1);
        const entry = ctx.columnMap.get(colName);
        if (entry) {
          fieldUpdateConfigs.push({ fieldName, columnId: entry.id });
          continue;
        }
      }
      fieldUpdateConfigs.push({ fieldName, value });
    }

    if (fieldUpdateConfigs.length > 0) {
      config.inputParams = { fieldUpdateConfigs };
    }
  }

  return config;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

function buildTextConfig(col: ColumnSpec): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  if (col.documentId) {
    config.documentId = col.documentId as string;
  }
  if (col.documentColumnIndex !== undefined) {
    config.documentColumnIndex = col.documentColumnIndex as number;
  }
  if (col.includeHeaders !== undefined) {
    config.includeHeaders = col.includeHeaders as boolean;
  }

  return config;
}
