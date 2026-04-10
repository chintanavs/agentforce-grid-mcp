/**
 * Shared helper functions for column config resolution and mutation.
 */

import { GridClient } from "../client.js";
import { configCache } from "./column-config-cache.js";

/**
 * Get or reconstruct the full outer config for a column.
 * First checks the in-memory cache. On miss, fetches the worksheet data
 * from the generic endpoint (which returns nested config.config) and
 * reconstructs the outer config object that typed mutation tools need.
 *
 * Returns null only if the column has no config at all (shouldn't happen).
 */
export async function getOrFetchColumnConfig(
  client: GridClient,
  columnId: string,
  worksheetId: string,
): Promise<any | null> {
  // Fast path: cache hit
  const cached = configCache.get(columnId);
  if (cached) return cached;

  // Slow path: fetch from API using the generic endpoint which includes full config
  const wsData = await client.get(`/worksheets/${encodeURIComponent(worksheetId)}/data-generic`);
  const columns: any[] = wsData?.columns ?? [];
  const col = columns.find((c: any) => c.id === columnId);

  if (!col?.config) return null;

  // The generic endpoint wraps config as { config: { config: { ...innerFields } } }
  // We need the outer config: { type, queryResponseFormat, autoUpdate, config: innerConfig }
  let outerConfig: any;
  if (col.config.config) {
    // Generic endpoint nests it: col.config = { config: { ...innerFields } }
    // Reconstruct the outer config shape the typed mutation tools expect
    outerConfig = {
      type: col.type,
      config: col.config.config,
    };
  } else {
    // Regular endpoint: col.config is already the inner config
    outerConfig = {
      type: col.type,
      config: col.config,
    };
  }

  // Cache it for future use
  configCache.set(columnId, outerConfig);
  return outerConfig;
}

/**
 * Fetch worksheet data containing the given column and extract its config.
 * Searches all worksheets in all workbooks to find the column.
 */
export async function getColumnConfig(
  client: GridClient,
  columnId: string,
  worksheetId?: string,
): Promise<{ column: any; worksheetId: string; worksheetColumns: any[] }> {
  // Fast path: if worksheetId provided, go directly to it
  if (worksheetId) {
    const wsData = await client.get(`/worksheets/${encodeURIComponent(worksheetId)}/data`);
    const columns: any[] = wsData?.columns ?? [];
    const match = columns.find((col: any) => col.id === columnId);
    if (match) {
      return { column: match, worksheetId, worksheetColumns: columns };
    }
    throw new Error(`Column ${columnId} not found in worksheet ${worksheetId}`);
  }

  // Slow path: scan all workbooks/worksheets
  const workbooks = await client.get("/workbooks");
  const wbList = Array.isArray(workbooks) ? workbooks : workbooks?.workbooks ?? [];

  for (const wb of wbList) {
    const workbook = await client.get(`/workbooks/${encodeURIComponent(wb.id)}`);
    const worksheetIds: string[] = workbook?.worksheetIds ?? workbook?.worksheets?.map((w: any) => w.id) ?? [];

    for (const wsId of worksheetIds) {
      const wsData = await client.get(`/worksheets/${encodeURIComponent(wsId)}/data`);
      const columns: any[] = wsData?.columns ?? [];
      const match = columns.find((col: any) => col.id === columnId);
      if (match) {
        return { column: match, worksheetId: wsId, worksheetColumns: columns };
      }
    }
  }

  throw new Error(`Column ${columnId} not found in any worksheet`);
}

/**
 * Resolve a column reference by name (case-insensitive) or by ID.
 * Returns a referenceAttribute-compatible object, or null if not found.
 */
export function resolveColumnRef(
  nameOrId: string,
  columns: any[]
): { columnId: string; columnName: string; columnType: string } | null {
  const lower = nameOrId.toLowerCase();

  for (const col of columns) {
    if (col.id === nameOrId || (col.name && col.name.toLowerCase() === lower)) {
      return {
        columnId: col.id,
        columnName: col.name,
        columnType: col.type ?? col.config?.type ?? "Text",
      };
    }
  }

  return null;
}

/**
 * Deep merge changes into existing config. Arrays are replaced, not concatenated.
 * Returns a new object; does not mutate inputs.
 */
export function mergeConfig(existing: any, changes: Record<string, any>): any {
  if (existing == null || typeof existing !== "object" || Array.isArray(existing)) {
    return changes;
  }

  const result: Record<string, any> = { ...existing };

  for (const [key, value] of Object.entries(changes)) {
    const prev = result[key];
    if (
      value != null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      prev != null &&
      typeof prev === "object" &&
      !Array.isArray(prev)
    ) {
      result[key] = mergeConfig(prev, value);
    } else {
      result[key] = value;
    }
  }

  return result;
}
