#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GridClient, GridClientConfig } from "./client.js";
import { registerWorkbookTool } from "./tools/workbook.js";
import { registerWorksheetTool } from "./tools/worksheet.js";
import { registerColumnTool } from "./tools/column.js";
import { registerColumnMutationTool } from "./tools/column-mutation.js";
import { registerCellTool } from "./tools/cell.js";
import { registerDiscoverTool } from "./tools/discover.js";
import { registerWorkflowTools } from "./tools/workflows.js";
import { registerApplyGridTool } from "./tools/apply-grid.js";
import { registerUrlTools } from "./tools/urls.js";
import { ResourceCache } from "./lib/resource-cache.js";
import { registerWorksheetResources } from "./resources/worksheet-resources.js";
import { registerMetadataResources } from "./resources/metadata-resources.js";
import { registerDslResource } from "./resources/dsl-resource.js";
import { registerPrompts } from "./prompts/index.js";

const config: GridClientConfig = {
  instanceUrl: process.env.INSTANCE_URL,
  orgAlias: process.env.ORG_ALIAS,
  apiVersion: process.env.API_VERSION,
  timeoutMs: process.env.GRID_TIMEOUT ? (() => { const n = parseInt(process.env.GRID_TIMEOUT!, 10); if (isNaN(n)) throw new Error("GRID_TIMEOUT must be a number"); return n; })() : undefined,
  accessToken: process.env.GRID_ACCESS_TOKEN,
};

const client = new GridClient(config);

const server = new McpServer({
  name: "grid-connect",
  version: "1.0.0",
});

// Consolidated tools (~15 instead of 65)
registerWorkbookTool(server, client);      // workbook (list, create, create_with_worksheet, get, get_worksheets, delete)
registerWorksheetTool(server, client);     // worksheet (create, get, get_data, get_data_generic, update, delete, add_rows, delete_rows, import_csv, run, get_run_job)
registerColumnTool(server, client);        // column (CRUD: add, edit, save, delete, reprocess, get_data, create_from_utterance, generate_json_path)
registerColumnMutationTool(server, client); // column_mutation (typed shorthands: edit_ai_prompt, edit_agent_config, add_evaluation, change_model, update_filters, reprocess_typed, edit_prompt_template)
registerCellTool(server, client);          // cell (update, paste, trigger_execution, validate_formula, generate_ia_input)
registerDiscoverTool(server, client);      // discover (23+ metadata/data/agent discovery actions)
registerWorkflowTools(server, client);     // poll_worksheet_status, get_worksheet_summary, setup_agent_test
registerApplyGridTool(server, client);     // apply_grid (declarative YAML)
registerUrlTools(server, client);          // get_url

const resourceCache = new ResourceCache();
registerWorksheetResources(server, client, resourceCache);
registerMetadataResources(server, client, resourceCache);
registerDslResource(server);

registerPrompts(server);

const transport = new StdioServerTransport();
await server.connect(transport);
