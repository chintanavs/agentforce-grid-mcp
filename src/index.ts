#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GridClient, GridClientConfig } from "./client.js";
import { registerWorkbookTools } from "./tools/workbooks.js";
import { registerWorksheetTools } from "./tools/worksheets.js";
import { registerColumnTools } from "./tools/columns.js";
import { registerCellTools } from "./tools/cells.js";
import { registerAgentTools } from "./tools/agents.js";
import { registerMetadataTools } from "./tools/metadata.js";
import { registerDataTools } from "./tools/data.js";
import { registerWorkflowTools } from "./tools/workflows.js";
import { registerApplyGridTool } from "./tools/apply-grid.js";
import { registerTypedMutationTools } from "./tools/typed-mutations.js";
import { registerUrlTools } from "./tools/urls.js";
import { ResourceCache } from "./lib/resource-cache.js";
import { registerWorksheetResources } from "./resources/worksheet-resources.js";
import { registerMetadataResources } from "./resources/metadata-resources.js";
import { registerDslResource } from "./resources/dsl-resource.js";

const config: GridClientConfig = {
  instanceUrl: process.env.INSTANCE_URL,
  orgAlias: process.env.ORG_ALIAS,
  apiVersion: process.env.API_VERSION,
  timeoutMs: process.env.GRID_TIMEOUT ? (() => { const n = parseInt(process.env.GRID_TIMEOUT!, 10); if (isNaN(n)) throw new Error("GRID_TIMEOUT must be a number"); return n; })() : undefined,
};

const client = new GridClient(config);

const server = new McpServer({
  name: "grid-connect",
  version: "1.0.0",
});

registerWorkbookTools(server, client);
registerWorksheetTools(server, client);
registerColumnTools(server, client);
registerCellTools(server, client);
registerAgentTools(server, client);
registerMetadataTools(server, client);
registerDataTools(server, client);
registerWorkflowTools(server, client);
registerApplyGridTool(server, client);
registerTypedMutationTools(server, client);
registerUrlTools(server, client);

const resourceCache = new ResourceCache();
registerWorksheetResources(server, client, resourceCache);
registerMetadataResources(server, client, resourceCache);
registerDslResource(server);

const transport = new StdioServerTransport();
await server.connect(transport);
