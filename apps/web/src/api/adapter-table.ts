/**
 * The per-resource adapter table and the factory that builds a `ForgeApi` from it.
 *
 * Why: this table is the single switch between the real Forge server and typed fixtures.
 *   A resource moves from `'mock'` to `'http'` in the same batch that builds its endpoint, and
 *   nothing else changes (build plan, "Data layer"). Every resource whose endpoint exists
 *   today is `'http'`. `createForgeApi()` throws at startup when the table names an adapter
 *   that cannot serve a resource, so a half-wired switch fails on load, not on the user's
 *   first click.
 *
 * Exports: ADAPTER_TABLE, createForgeApi(), sourcesOf().
 * Depends on: api/api-error, types/api.types.
 */

import { ApiError } from '#/api/api-error.js';
import type {
  AdapterKind,
  AdapterTable,
  ForgeApi,
  ForgeApiAdapter,
  ResourceName,
} from '#/types/api.types.js';

/** Which adapter serves each resource. Flip a line to `'http'` when its server endpoint ships. */
export const ADAPTER_TABLE: AdapterTable = {
  projects: 'http',
  harnesses: 'http',
  github: 'http',
  settings: 'http',
  projectSettings: 'http',
  memory: 'http',
};

const RESOURCES = Object.keys(ADAPTER_TABLE) as ResourceName[];

/** The table with every resource forced to one adapter (dev and test only: `VITE_FORGE_API=mock`). */
export function forced(kind: AdapterKind): AdapterTable {
  return Object.fromEntries(RESOURCES.map((name) => [name, kind])) as AdapterTable;
}

/** Combines the adapters into one API, resource by resource, as the table says. */
export function createForgeApi(
  table: AdapterTable,
  adapters: Readonly<Record<AdapterKind, ForgeApiAdapter>>,
): ForgeApi {
  const api: Partial<Record<ResourceName, unknown>> = {};

  for (const name of RESOURCES) {
    const resource = adapters[table[name]][name];
    if (resource === undefined) {
      throw new ApiError(
        'payload',
        `The '${table[name]}' adapter does not serve '${name}'; fix ADAPTER_TABLE.`,
      );
    }

    api[name] = resource;
  }

  return api as ForgeApi;
}

/** Which adapter serves each resource, for the "Fixture data" mark. */
export function sourcesOf(table: AdapterTable): readonly AdapterKind[] {
  return RESOURCES.map((name) => table[name]);
}
