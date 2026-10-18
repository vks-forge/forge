/**
 * Pins the `none` research provider and the factory that picks providers.
 *
 * Why: when research is off (provider `none`) the Director's research step must finish with a plain note
 *   and a Worker's web tools must refuse in plain words, with no network access at all and no setup. The
 *   factory must choose by the settings value and build the network ports only for a provider that needs
 *   them.
 *
 * Pins: createNoneProvider(), createResearchProvider(), ProviderFactories.
 * Depends on: src/index, tests/helpers/fake-network, vitest.
 */

import { describe, expect, it } from 'vitest';
import { NOT_CONFIGURED_MESSAGE, ProviderFactories, createResearchProvider } from '#/index.js';
import { SETTINGS, fakeNet } from '#tests/helpers/fake-network.js';

const OPTS = { maxBytes: 1000, timeoutMs: 1000, allowHosts: [], denyHosts: [] };

describe('none provider', () => {
  it('declares no capability and answers not_configured, never touching the network', async () => {
    const touched: string[] = [];
    const net = fakeNet({
      resolve: async () => {
        touched.push('dns');

        return [];
      },
      fetch: async () => {
        touched.push('fetch');

        return new Response('');
      },
    });

    const p = createResearchProvider({ ...SETTINGS, provider: 'none' }, net);

    expect(p.capabilities()).toEqual({
      provider: 'none',
      search: false,
      fetch: false,
      reportsCost: false,
    });

    for (const res of [
      await p.search('widget limits', { maxResults: 3 }),
      await p.fetch('https://example.com/', OPTS),
      await p.health(),
    ]) {
      expect(res).toEqual({
        ok: false,
        error: { kind: 'not_configured', message: NOT_CONFIGURED_MESSAGE },
      });
    }

    expect(touched).toEqual([]);
  });
});

describe('createResearchProvider', () => {
  it('has a factory for every provider id and picks by the settings value', () => {
    expect(Object.keys(ProviderFactories).sort()).toEqual(['none', 'searxng']);
    expect(createResearchProvider(SETTINGS, fakeNet()).capabilities().provider).toBe('searxng');
    expect(createResearchProvider({ ...SETTINGS, provider: 'none' }).capabilities().provider).toBe(
      'none',
    );
  });
});
