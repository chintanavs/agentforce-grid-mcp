import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GridClient } from "../client.js";
import { z } from "zod";
import { requireParam, ValidationError } from "../lib/validation.js";

export function registerDiscoverTool(server: McpServer, client: GridClient): void {
  server.tool(
    "discover",
    "Discover available metadata: column_types, llm_models, supported_types, evaluation_types, formula_functions, formula_operators, invocable_actions, invocable_action_details, prompt_templates, prompt_template_details, list_views, list_view_soql, sobjects, sobject_fields_display, sobject_fields_filter, sobject_fields_record_update, dataspaces, data_model_objects, data_model_object_fields, agents, agent_variables, generate_soql, generate_test_columns",
    {
      what: z.enum([
        "column_types", "llm_models", "supported_types", "evaluation_types",
        "formula_functions", "formula_operators", "invocable_actions", "invocable_action_details",
        "prompt_templates", "prompt_template_details",
        "list_views", "list_view_soql",
        "sobjects", "sobject_fields_display", "sobject_fields_filter", "sobject_fields_record_update",
        "dataspaces", "data_model_objects", "data_model_object_fields",
        "agents", "agent_variables",
        "generate_soql", "generate_test_columns",
      ]),
      // Params needed by specific discovery types
      actionName: z.string().optional().describe("For invocable_action_details"),
      actionType: z.string().optional().describe("For invocable_action_details"),
      actionUrl: z.string().optional().describe("For invocable_action_details (the action's url field from invocable_actions response, e.g. /actions/standard/emailSimple)"),
      promptTemplateDevName: z.string().optional().describe("For prompt_template_details"),
      listViewId: z.string().optional().describe("For list_view_soql"),
      sObjectType: z.string().optional().describe("For list_view_soql"),
      sobjectList: z.string().optional().describe("JSON array string for sobject_fields_display/filter/record_update"),
      dataspace: z.string().optional().describe("For data_model_objects, data_model_object_fields"),
      dmoName: z.string().optional().describe("For data_model_object_fields"),
      versionId: z.string().optional().describe("Agent version ID for agent_variables"),
      includeDrafts: z.boolean().optional().describe("For agents"),
      text: z.string().optional().describe("Natural language for generate_soql"),
      testData: z.string().optional().describe("JSON string for generate_test_columns. Generates a test-suite workbook for an Agentforce agent. Required: numberOfTestCases (int), agentId (string from `discover agents`). Optional: testSuiteLabel, testSuiteDevName, testSuiteDescription, agentVersionId, customInstructions, selectedContextVariables (object), metrics (string[]), topicsList (string[]), conversationHistory, customEvaluations (object[]), isDraft (bool), enableSimulationMode (bool), dataSpace, language. Example: {\"numberOfTestCases\":3,\"agentId\":\"...\"}"),
    },
    async (params) => {
      const { what } = params;
      try {
        switch (what) {
          // ===============================================================
          // Metadata (from metadata.ts)
          // ===============================================================
          case "column_types": {
            const result = await client.get("/column-types");
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          case "llm_models": {
            const result = await client.get("/llm-models");
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          case "supported_types": {
            const result = await client.get("/supported-types");
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          case "evaluation_types": {
            const result = await client.get("/evaluation-types");
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          case "formula_functions": {
            const result = await client.get("/formula-functions");
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          case "formula_operators": {
            const result = await client.get("/formula-operators");
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          case "invocable_actions": {
            const result = await client.get("/invocable-actions");
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          case "invocable_action_details": {
            requireParam(params.actionName, "actionName", "invocable_action_details");
            requireParam(params.actionType, "actionType", "invocable_action_details");
            requireParam(params.actionUrl, "actionUrl", "invocable_action_details (use the 'url' field from invocable_actions response)");
            const path = `/invocable-actions/describe?actionName=${encodeURIComponent(params.actionName)}&actionType=${encodeURIComponent(params.actionType)}&url=${encodeURIComponent(params.actionUrl)}`;
            const result = await client.get(path);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          case "prompt_templates": {
            const result = await client.get("/prompt-templates");
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          case "prompt_template_details": {
            requireParam(params.promptTemplateDevName, "promptTemplateDevName", "prompt_template_details");
            const result = await client.get(`/prompt-templates/${encodeURIComponent(params.promptTemplateDevName)}`);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          case "list_views": {
            const result = await client.get("/list-views");
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          case "list_view_soql": {
            requireParam(params.listViewId, "listViewId", "list_view_soql");
            requireParam(params.sObjectType, "sObjectType", "list_view_soql");
            const result = await client.get(
              `/list-views/${encodeURIComponent(params.listViewId)}/soql?sObjectType=${encodeURIComponent(params.sObjectType)}`
            );
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          case "generate_soql": {
            requireParam(params.text, "text", "generate_soql");
            const result = await client.post("/generate-soql", { text: params.text });
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          case "generate_test_columns": {
            requireParam(params.testData, "testData", "generate_test_columns");
            let body: unknown;
            try {
              body = JSON.parse(params.testData);
            } catch (e) {
              return { content: [{ type: "text" as const, text: `Invalid JSON in testData parameter: ${(e as Error).message}. Please provide a valid JSON string.` }], isError: true };
            }
            const result = await client.post("/worksheets/test-case-generation", body);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          // ===============================================================
          // Data (from data.ts)
          // ===============================================================
          case "sobjects": {
            const result = await client.get("/sobjects");
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          case "sobject_fields_display": {
            requireParam(params.sobjectList, "sobjectList", "sobject_fields_display");
            let parsed: unknown;
            try {
              parsed = JSON.parse(params.sobjectList);
            } catch (e) {
              return { content: [{ type: "text" as const, text: `Invalid JSON in sobjectList parameter: ${(e as Error).message}. Please provide a valid JSON array string, e.g. ["Account", "Contact"].` }], isError: true };
            }
            const result = await client.post("/sobjects/fields-display", { sobjectList: parsed });
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          case "sobject_fields_filter": {
            requireParam(params.sobjectList, "sobjectList", "sobject_fields_filter");
            let parsed: unknown;
            try {
              parsed = JSON.parse(params.sobjectList);
            } catch (e) {
              return { content: [{ type: "text" as const, text: `Invalid JSON in sobjectList parameter: ${(e as Error).message}. Please provide a valid JSON array string, e.g. ["Account", "Contact"].` }], isError: true };
            }
            const result = await client.post("/sobjects/fields-filter", { sobjectList: parsed });
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          case "sobject_fields_record_update": {
            requireParam(params.sobjectList, "sobjectList", "sobject_fields_record_update");
            let parsed: unknown;
            try {
              parsed = JSON.parse(params.sobjectList);
            } catch (e) {
              return { content: [{ type: "text" as const, text: `Invalid JSON in sobjectList parameter: ${(e as Error).message}. Please provide a valid JSON array string, e.g. ["Account", "Contact"].` }], isError: true };
            }
            const result = await client.post("/sobjects/fields-record-update", { sobjectList: parsed });
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          case "dataspaces": {
            const result = await client.get("/dataspaces");
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          case "data_model_objects": {
            requireParam(params.dataspace, "dataspace", "data_model_objects");
            const result = await client.get(`/dataspaces/${encodeURIComponent(params.dataspace)}/data-model-objects`);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          case "data_model_object_fields": {
            requireParam(params.dataspace, "dataspace", "data_model_object_fields");
            requireParam(params.dmoName, "dmoName", "data_model_object_fields");
            const result = await client.get(
              `/dataspaces/${encodeURIComponent(params.dataspace)}/data-model-objects/${encodeURIComponent(params.dmoName)}/fields`
            );
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          // ===============================================================
          // Agents (from agents.ts)
          // ===============================================================
          case "agents": {
            const path = params.includeDrafts ? "/agents?includeDrafts=true" : "/agents";
            const result = await client.get(path);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }

          case "agent_variables": {
            requireParam(params.versionId, "versionId", "agent_variables");
            const result = await client.get(`/agents/${encodeURIComponent(params.versionId)}/variables`);
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
