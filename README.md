# Grid Connect MCP Server

MCP server for [Agentforce Grid](https://help.salesforce.com/s/articleView?id=sf.ai_workbench.htm) (formerly AI Workbench). Enables Claude Code and other MCP clients to create, modify, and monitor Grid workbooks, worksheets, and columns through the Grid Connect API.

## Highlights

- **65+ MCP tools** across 10 modules (CRUD, composites, typed mutations)
- **`apply_grid`** — create an entire grid from a single YAML spec (one tool call replaces 10-15 sequential calls)
- **Typed Zod schemas** for all 12 column types, validated before every API call
- **7 typed mutation tools** for focused edits (change prompt, swap model, add evaluation) without raw JSON
- **Composite workflows** — `setup_agent_test`, `poll_worksheet_status`, `get_worksheet_summary`
- **Hardened request logic** with retry on network errors, 429 rate-limit respect, 5xx exponential backoff

## Authentication

This server uses **Salesforce CLI (sf) `api request` commands** for all API calls. Authentication is handled entirely by the SF CLI:

- No manual token management required
- SF CLI handles OAuth flows, token refresh, and expiration automatically
- Supports all SF CLI authentication methods (web login, JWT, refresh tokens, etc.)
- Works with any org authenticated via `sf org login`

## Quick Start

### Prerequisites

Install Salesforce CLI:
```bash
brew install sf
```

### Setup

1. **Login to your Salesforce org:**

```bash
sf org login web --alias my-org --instance-url https://your-instance.salesforce.com/
```

Or set as default org:
```bash
sf org login web --set-default --instance-url https://your-instance.salesforce.com/
```

2. **Verify your connection:**

Test that you can access the Grid Connect API:
```bash
sf api request rest "/services/data/v66.0/public/grid/workbooks" \
  --method GET \
  --target-org my-org
```

Or if you set a default org:
```bash
sf api request rest "/services/data/v66.0/public/grid/workbooks" \
  --method GET
```

3. **Install and build:**

```bash
npm install
npm run build

# Optional: Set environment variables if needed
# export ORG_ALIAS="orgfarm-org"  # If not set, uses SF CLI default org
# export INSTANCE_URL="https://sdb3.test1.pc-rnd.pc-aws.salesforce.com"  # Only for Lightning URL generation

npm start
```

### Claude Code Configuration

**Minimal configuration (uses SF CLI default org):**

```json
{
  "mcpServers": {
    "grid-connect": {
      "command": "node",
      "args": ["/path/to/agentforce-grid-mcp/dist/index.js"]
    }
  }
}
```

**With specific org:**

```json
{
  "mcpServers": {
    "grid-connect": {
      "command": "node",
      "args": ["/path/to/agentforce-grid-mcp/dist/index.js"],
      "env": {
        "ORG_ALIAS": "orgfarm-org"
      }
    }
  }
}
```

### Environment Variables

**All environment variables are optional:**

| Variable | Default | Description |
|----------|---------|-------------|
| `ORG_ALIAS` | SF CLI default org | Target org alias (if not set, SF CLI uses your default org) |
| `INSTANCE_URL` | `undefined` | Salesforce instance URL (required only for Lightning Experience URL generation via `get_url` tool) |
| `API_VERSION` | `v66.0` | Salesforce API version |
| `GRID_TIMEOUT` | `60000` | Request timeout in milliseconds |
| `GRID_DEBUG` | `false` | Enable debug logging to stderr |

## Architecture

```
src/
  index.ts                    # MCP server entry point
  client.ts                   # SF CLI API wrapper with retry logic
  schemas.ts                  # Zod schemas for all 12 column types
  types.ts                    # Shared types
  tools/
    workbooks.ts              # 5 tools: list, create, get, get worksheets, delete
    worksheets.ts             # 11 tools: create, get, data, import, update, run, etc.
    columns.ts                # 8 tools: add, edit, delete, save, reprocess, etc.
    cells.ts                  # 5 tools: update, paste, trigger execution, etc.
    agents.ts                 # 2 tools: list agents, get variables
    metadata.ts               # 14 tools: models, eval types, formulas, prompts, etc.
    data.ts                   # 7 tools: sobjects, dataspaces, DMOs
    workflows.ts              # 4 composites: setup_agent_test, poll, summary
    apply-grid.ts             # apply_grid: YAML DSL → entire grid in one call
    typed-mutations.ts        # 7 typed tools: edit prompt, add eval, change model, etc.
    urls.ts                   # 1 tool: generate Lightning Experience URLs
  lib/
    yaml-parser.ts            # Parse YAML DSL → GridSpec AST
    validator.ts              # 6-pass semantic validation (refs, cycles, types)
    config-expander.ts        # Flat YAML → triple-nested GCC JSON (Zod-validated)
    resolution-engine.ts      # Full pipeline: parse → validate → sort → create
    model-map.ts              # Model shorthand ↔ sfdc_ai__ ID mapping (16 shorthands)
    config-helpers.ts         # Shared: fetch config, resolve refs, deep merge
    column-config-cache.ts    # Session-lifetime config cache for typed mutations
    worksheet-data-helpers.ts # Helpers for columnData response format
    resource-cache.ts         # TTL-based cache for MCP resources
```

## Tool Categories

### `apply_grid` — Declarative Grid Creation

The flagship tool. Pass a YAML spec and get a complete grid:

```yaml
workbook: Sales Agent Tests
worksheet: Q1 Regression
columns:
  - name: Utterances
    type: text

  - name: Agent Output
    type: agent_test
    agent: "Sales Coach"
    inputUtterance: "Utterances"

  - name: Coherence
    type: eval/coherence
    input: "Agent Output"

  - name: Topic Check
    type: eval/topic_assertion
    input: "Agent Output"
    reference: "Expected Topics"

data:
  Utterances:
    - "How do I reset my password?"
    - "What is my account balance?"
```

The tool handles:
- Workbook/worksheet creation
- Agent name → ID resolution
- Column dependency ordering (topological sort)
- Config expansion (flat YAML → nested JSON validated by Zod)
- Sequential column creation with ID wiring
- Data population
- `dryRun` mode for validation without API calls

### Typed Mutation Tools

Modify existing grids without constructing raw JSON:

| Tool | Purpose |
|------|---------|
| `edit_ai_prompt` | Change instruction, model, response format on AI columns |
| `edit_agent_config` | Update agent, utterance, context variables |
| `add_evaluation` | Add evaluation column with auto-wired references |
| `change_model` | Switch LLM model (supports shorthands like `gpt-4-omni`, `claude-4.5-sonnet`) |
| `update_filters` | Change Object/DataModelObject query filters |
| `reprocess` | Reprocess column or worksheet (all/failed/stale) |
| `edit_prompt_template` | Update template and input mappings |

### CRUD Tools

Standard operations for workbooks, worksheets, columns, cells, rows.

### Discovery Tools

| Tool | Returns |
|------|---------|
| `get_agents` | Available agents with IDs, versions, topics |
| `get_llm_models` | Available models |
| `get_evaluation_types` | All 12 evaluation types |
| `get_sobjects` / `get_sobject_fields` | SObject metadata |
| `get_dataspaces` / `get_data_model_objects` | Data Cloud DMOs |
| `get_prompt_templates` | Available prompt templates |
| `get_invocable_actions` | Available Flows, Apex, etc. |
| `get_formula_functions` / `get_formula_operators` | Formula reference |

### Composite Workflows

| Tool | Purpose |
|------|---------|
| `setup_agent_test` | Create a full agent test suite in one call |
| `poll_worksheet_status` | Poll until processing completes |
| `get_worksheet_summary` | Structured column/status summary |
| `create_workbook_with_worksheet` | Create both in one step |

## Column Types

All 12 Agentforce Grid column types are supported with typed Zod schemas:

| Type | DSL Name | Purpose |
|------|----------|---------|
| AI | `ai` | LLM text generation with custom prompts |
| Agent | `agent` | Run agent conversations |
| AgentTest | `agent_test` | Batch agent testing |
| Object | `object` | Query Salesforce SObjects |
| DataModelObject | `data_model_object` | Query Data Cloud DMOs |
| Evaluation | `eval/*` | Evaluate outputs (12 evaluation types) |
| Reference | `reference` | Extract fields via JSON path |
| Formula | `formula` | Computed values |
| PromptTemplate | `prompt_template` | Execute prompt templates |
| InvocableAction | `invocable_action` | Execute Flows/Apex |
| Action | `action` | Standard platform actions |
| Text | `text` | Static/editable text |

## Model Shorthands

Use short names instead of full `sfdc_ai__*` identifiers:

| Shorthand | Model |
|-----------|-------|
| `gpt-4-omni` | GPT 4 Omni |
| `gpt-4-omni-mini` | GPT 4 Omni Mini |
| `gpt-4.1` | GPT 4.1 |
| `gpt-4.1-mini` | GPT 4.1 Mini |
| `gpt-5` | GPT 5 |
| `gpt-5-mini` | GPT 5 Mini |
| `o3` | O3 |
| `o4-mini` | O4 Mini |
| `claude-4.5-sonnet` | Claude 4.5 Sonnet |
| `claude-4.5-haiku` | Claude 4.5 Haiku |
| `claude-4-sonnet` | Claude 4 Sonnet |
| `gemini-2.5-flash` | Gemini 2.5 Flash |
| `gemini-2.5-flash-lite` | Gemini 2.5 Flash Lite |
| `gemini-2.5-pro` | Gemini 2.5 Pro |
| `nova-lite` | Amazon Nova Lite |
| `nova-pro` | Amazon Nova Pro |

## Validation

Every column config is validated against typed Zod schemas before hitting the API. The `apply_grid` tool adds 6-pass semantic validation:

1. **Schema** — required fields, valid types
2. **Type-specific fields** — each column type's required config
3. **Reference integrity** — all column name references resolve
4. **Cycle detection** — no circular dependencies (Kahn's algorithm)
5. **Type compatibility** — eval targets valid column types
6. **Value validation** — valid eval types, model names, response formats

## Development

```bash
npm run build    # Compile TypeScript
npm run dev      # Watch mode
npm start        # Run the server
```
