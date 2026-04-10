import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GridClient } from "../client.js";
import { z } from "zod";

export function registerMetadataTools(server: McpServer, client: GridClient): void {
  server.tool(
    "get_column_types",
    "Get available column types for Agentforce Grid",
    {},
    async () => {
      try {
        const result = await client.get("/column-types");
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error fetching column types: ${message}` }],
        };
      }
    }
  );

  server.tool(
    "get_llm_models",
    "Get available LLM models. Use the model name for both modelId and modelName in column configs.",
    {},
    async () => {
      try {
        const result = await client.get("/llm-models");
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error fetching LLM models: ${message}` }],
        };
      }
    }
  );

  server.tool(
    "get_supported_types",
    "Get all supported data types in Agentforce Grid, including input types, output types, and field types used across column configurations.",
    {},
    async () => {
      try {
        const result = await client.get("/supported-types");
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error fetching supported types: ${message}` }],
        };
      }
    }
  );

  server.tool(
    "get_evaluation_types",
    "Get available evaluation types: COHERENCE, CONCISENESS, FACTUALITY, INSTRUCTION_FOLLOWING, COMPLETENESS, RESPONSE_MATCH, TOPIC_ASSERTION, ACTION_ASSERTION, LATENCY_ASSERTION, BOT_RESPONSE_RATING, EXPRESSION_EVAL, CUSTOM_LLM_EVALUATION",
    {},
    async () => {
      try {
        const result = await client.get("/evaluation-types");
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error fetching evaluation types: ${message}` }],
        };
      }
    }
  );

  server.tool(
    "get_formula_functions",
    "Get available formula functions for Agentforce Grid",
    {},
    async () => {
      try {
        const result = await client.get("/formula-functions");
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error fetching formula functions: ${message}` }],
        };
      }
    }
  );

  server.tool(
    "get_formula_operators",
    "Get available formula operators for Agentforce Grid",
    {},
    async () => {
      try {
        const result = await client.get("/formula-operators");
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error fetching formula operators: ${message}` }],
        };
      }
    }
  );

  server.tool(
    "get_invocable_actions",
    "Get all available invocable actions (Flows, Apex, etc.)",
    {},
    async () => {
      try {
        const result = await client.get("/invocable-actions");
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error fetching invocable actions: ${message}` }],
        };
      }
    }
  );

  server.tool(
    "describe_invocable_action",
    "Get detailed information about a specific invocable action including inputs and outputs",
    {
      actionName: z.string().describe("The name of the invocable action"),
      actionType: z.string().describe("The type of the invocable action"),
    },
    async ({ actionName, actionType }) => {
      try {
        const path = `/invocable-actions/describe?actionName=${encodeURIComponent(actionName)}&actionType=${encodeURIComponent(actionType)}`;
        const result = await client.get(path);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            { type: "text", text: `Error describing invocable action: ${message}` },
          ],
        };
      }
    }
  );

  server.tool(
    "get_prompt_templates",
    "Get available prompt templates",
    {},
    async () => {
      try {
        const result = await client.get("/prompt-templates");
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error fetching prompt templates: ${message}` }],
        };
      }
    }
  );

  server.tool(
    "get_prompt_template",
    "Get a specific prompt template by developer name",
    {
      promptTemplateDevName: z
        .string()
        .describe("The developer name of the prompt template"),
    },
    async ({ promptTemplateDevName }) => {
      try {
        const result = await client.get(`/prompt-templates/${encodeURIComponent(promptTemplateDevName)}`);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error fetching prompt template: ${message}` }],
        };
      }
    }
  );

  server.tool(
    "get_list_views",
    "Get available list views",
    {},
    async () => {
      try {
        const result = await client.get("/list-views");
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error fetching list views: ${message}` }],
        };
      }
    }
  );

  server.tool(
    "get_list_view_soql",
    "Get the SOQL query for a specific list view",
    {
      listViewId: z.string().describe("The ID of the list view"),
      sObjectType: z.string().describe("The SObject type for the list view"),
    },
    async ({ listViewId, sObjectType }) => {
      try {
        const result = await client.get(
          `/list-views/${encodeURIComponent(listViewId)}/soql?sObjectType=${encodeURIComponent(sObjectType)}`
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error fetching list view SOQL: ${message}` }],
        };
      }
    }
  );

  server.tool(
    "generate_soql",
    "Convert natural language text to a SOQL query using AI",
    {
      text: z.string().describe("Natural language text to convert to SOQL"),
    },
    async ({ text }) => {
      try {
        const result = await client.post("/generate-soql", { text });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error generating SOQL: ${message}` }],
        };
      }
    }
  );

  server.tool(
    "generate_test_columns",
    "Generate test column configurations for the Testing Center. The testData parameter should be a JSON object containing test case specifications.",
    {
      testData: z.string().describe("JSON string of test case data"),
    },
    async ({ testData }) => {
      try {
        const body = JSON.parse(testData);
        const result = await client.post("/worksheets/test-case-generation", body);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof SyntaxError) {
          return {
            content: [
              {
                type: "text",
                text: `Invalid JSON in testData parameter: ${message}. Please provide a valid JSON string.`,
              },
            ],
          };
        }
        return {
          content: [
            { type: "text", text: `Error generating test columns: ${message}` },
          ],
        };
      }
    }
  );
}
