import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GridClient } from "../client.js";
import { z } from "zod";

export function registerDataTools(server: McpServer, client: GridClient): void {
  server.tool(
    "get_sobjects",
    "Get available Salesforce SObjects for Object column queries",
    {},
    async () => {
      try {
        const result = await client.get("/sobjects");
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error fetching SObjects: ${message}` }],
        };
      }
    }
  );

  server.tool(
    "get_sobject_fields_display",
    "Get field information for SObjects suitable for display",
    {
      sobjectList: z
        .string()
        .describe('JSON array of SObject API names, e.g. ["Account", "Contact"]'),
    },
    async ({ sobjectList }) => {
      try {
        const parsed = JSON.parse(sobjectList);
        const result = await client.post("/sobjects/fields-display", {
          sobjectList: parsed,
        });
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
                text: `Invalid JSON in sobjectList parameter: ${message}. Please provide a valid JSON array string, e.g. ["Account", "Contact"].`,
              },
            ],
          };
        }
        return {
          content: [
            { type: "text", text: `Error fetching SObject fields for display: ${message}` },
          ],
        };
      }
    }
  );

  server.tool(
    "get_sobject_fields_filter",
    "Get field information for SObjects suitable for filtering",
    {
      sobjectList: z
        .string()
        .describe('JSON array of SObject API names, e.g. ["Account", "Contact"]'),
    },
    async ({ sobjectList }) => {
      try {
        const parsed = JSON.parse(sobjectList);
        const result = await client.post("/sobjects/fields-filter", {
          sobjectList: parsed,
        });
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
                text: `Invalid JSON in sobjectList parameter: ${message}. Please provide a valid JSON array string, e.g. ["Account", "Contact"].`,
              },
            ],
          };
        }
        return {
          content: [
            { type: "text", text: `Error fetching SObject fields for filter: ${message}` },
          ],
        };
      }
    }
  );

  server.tool(
    "get_sobject_fields_record_update",
    "Get field information for SObjects suitable for record updates",
    {
      sobjectList: z
        .string()
        .describe('JSON array of SObject API names, e.g. ["Account", "Contact"]'),
    },
    async ({ sobjectList }) => {
      try {
        const parsed = JSON.parse(sobjectList);
        const result = await client.post("/sobjects/fields-record-update", {
          sobjectList: parsed,
        });
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
                text: `Invalid JSON in sobjectList parameter: ${message}. Please provide a valid JSON array string, e.g. ["Account", "Contact"].`,
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `Error fetching SObject fields for record update: ${message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "get_dataspaces",
    "Get available Data Cloud dataspaces",
    {},
    async () => {
      try {
        const result = await client.get("/dataspaces");
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error fetching dataspaces: ${message}` }],
        };
      }
    }
  );

  server.tool(
    "get_data_model_objects",
    "Get data model objects for a specific dataspace",
    {
      dataspace: z.string().describe("The dataspace name"),
    },
    async ({ dataspace }) => {
      try {
        const result = await client.get(
          `/dataspaces/${encodeURIComponent(dataspace)}/data-model-objects`
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            { type: "text", text: `Error fetching data model objects: ${message}` },
          ],
        };
      }
    }
  );

  server.tool(
    "get_data_model_object_fields",
    "Get fields for a specific data model object in a dataspace",
    {
      dataspace: z.string().describe("The dataspace name"),
      dmoName: z.string().describe("The data model object name"),
    },
    async ({ dataspace, dmoName }) => {
      try {
        const result = await client.get(
          `/dataspaces/${encodeURIComponent(dataspace)}/data-model-objects/${encodeURIComponent(dmoName)}/fields`
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Error fetching data model object fields: ${message}`,
            },
          ],
        };
      }
    }
  );
}
