/**
 * Pins: the adapter table decides, resource by resource, which adapter answers; `projects` is
 * served by the real server by default, a forced `mock` build serves fixtures, and a table that
 * names an adapter missing a resource fails at startup.
 *
 * Why: this table is the one switch between real data and fixtures (build plan, "Data layer").
 *   If it silently served fixtures in production, or let a half-wired resource through to the
 *   user's first click, the UI would show data that is not theirs or crash late.
 * Depends on: src/api/adapter-table, src/api/compose-api. No IO (fetch is a fake).
 */

import { describe, expect, it, vi } from 'vitest';
import {
  ADAPTER_TABLE,
  HTTP_ONLY_RESOURCES,
  createForgeApi,
  forced,
  sourcesOf,
} from '#/api/adapter-table.js';
import { composeApi } from '#/api/compose-api.js';
import type { ForgeApiAdapter } from '#/types/api.types.js';

/** Every resource in the table gets an empty stub, so the test does not change when a resource is added. */
const stubs = Object.fromEntries(
  [...Object.keys(ADAPTER_TABLE), ...HTTP_ONLY_RESOURCES].map((name) => [name, {}]),
);

const fakeProjects = (slug: string): ForgeApiAdapter => ({
  ...stubs,
  projects: {
    list: () =>
      Promise.resolve([
        {
          id: slug,
          slug,
          prefix: 'TST',
          status: 'ready' as const,
          ecosystems: [],
        },
      ]),
  },
});

describe('adapter table', () => {
  it('serves projects from the real server in the shipped table', () => {
    expect(ADAPTER_TABLE.projects).toBe('http');
  });

  it('routes each resource to the adapter the table names', async () => {
    const adapters = { http: fakeProjects('from-http'), mock: fakeProjects('from-mock') };

    const real = createForgeApi(forced('http'), adapters);
    const sample = createForgeApi(forced('mock'), adapters);

    expect((await real.projects.list())[0]?.slug).toBe('from-http');
    expect((await sample.projects.list())[0]?.slug).toBe('from-mock');
  });

  it('refuses to start when the chosen adapter cannot serve a resource', () => {
    expect(() => createForgeApi(forced('http'), { http: {}, mock: {} })).toThrow(
      /does not serve/,
    );
  });

  it('forces every resource to one adapter and reports the sources in use', () => {
    expect(Object.values(forced('mock')).every((kind) => kind === 'mock')).toBe(true);
    expect(new Set(sourcesOf(forced('mock')))).toEqual(new Set(['mock']));
    expect(new Set(sourcesOf(ADAPTER_TABLE))).toEqual(new Set(['http']));
  });
});

describe('composeApi', () => {
  it('calls the server through /api by default', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ projects: [] }));
    const { api, table } = composeApi({ fetch });

    await api.projects.list();

    expect(table).toEqual(ADAPTER_TABLE);
    expect(fetch).toHaveBeenCalledWith('/api/projects', expect.anything());
  });

  it('serves fixtures when forced to mock, and honours the scenario', async () => {
    const fetch = vi.fn();
    const { api } = composeApi({
      forceApi: 'mock',
      mockScenario: 'empty',
      latencyMs: [0, 0],
      fetch,
    });

    expect(await api.projects.list()).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('ignores an unknown scenario name and any value other than "mock"', async () => {
    const { api, table } = composeApi({
      forceApi: 'banana',
      mockScenario: 'chaos',
      fetch: vi.fn().mockResolvedValue(Response.json({ projects: [] })),
    });

    expect(table.projects).toBe('http');
    expect(await api.projects.list()).toEqual([]);
  });
});
