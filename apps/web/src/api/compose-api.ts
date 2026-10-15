/**
 * `composeApi()`: builds the app's ForgeApi from the build-time switch.
 *
 * Why: production behaviour is fixed by ADAPTER_TABLE, and nothing a user can type may flip
 *   it. Development and the Playwright smoke need to force fixtures (`VITE_FORGE_API=mock`)
 *   and pick a scenario (`VITE_FORGE_MOCK=empty|error`); those are dev/test build flags only
 *   (code.md rule 9). Keeping the decision in one pure function makes it testable without a
 *   browser and keeps `main.tsx` free of logic.
 *
 * Exports: composeApi().
 * Depends on: api/adapter-table, api/http/http-adapter, api/mock/mock-adapter, types/api.types.
 */

import { ADAPTER_TABLE, createForgeApi, forced } from '#/api/adapter-table.js';
import { createHttpAdapter } from '#/api/http/http-adapter.js';
import { createMockAdapter } from '#/api/mock/mock-adapter.js';
import type {
  AdapterTable,
  ComposeOptions,
  ForgeApi,
  MockScenario,
} from '#/types/api.types.js';

const SCENARIOS: readonly MockScenario[] = ['ok', 'empty', 'error'];

export function composeApi(options: ComposeOptions = {}): {
  readonly api: ForgeApi;
  readonly table: AdapterTable;
} {
  const table = options.forceApi === 'mock' ? forced('mock') : ADAPTER_TABLE;
  const scenario = SCENARIOS.find((s) => s === options.mockScenario) ?? 'ok';
  const api = createForgeApi(table, {
    http: createHttpAdapter({
      baseUrl: options.baseUrl ?? '/api',
      ...(options.fetch ? { fetch: options.fetch } : {}),
    }),
    mock: createMockAdapter({
      scenario,
      ...(options.latencyMs ? { latencyMs: options.latencyMs } : {}),
    }),
  });

  return { api, table };
}
