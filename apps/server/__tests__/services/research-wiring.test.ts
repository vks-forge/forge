/**
 * The research wiring: one live provider that follows the saved settings, and the Test button.
 *
 * Why: the owner changes where Forge searches in the UI and expects the Director to follow without a restart;
 *   the Test button must try a provider before it is saved and answer in a typed reply. The provider the engine
 *   holds is built from the company's research settings and rebuilt when their version changes; an unreadable
 *   settings read keeps the provider that works. Proven with fake network ports, so no test touches the web.
 *
 * Pins: the live provider follows a saved change (provider none, a new SearXNG URL), `test()` for saved and unsaved
 *   settings with latency or the typed error, and nothing is written.
 * Depends on: src/services/research-wiring, @forge/db (memory config), @forge/research (types), vitest.
 */

import type { ConfigSource } from '@forge/core';
import { createMemoryConfigSource } from '@forge/db';
import type { NetworkPorts } from '@forge/research';
import { describe, expect, it } from 'vitest';
import { buildResearchWiring } from '#/services/research-wiring.js';

const hit = { title: 'T', url: 'https://a.example/x', content: 'c' };

function net(over: Partial<NetworkPorts> = {}): NetworkPorts & { urls: string[] } {
  const urls: string[] = [];

  return {
    urls,
    resolve: async () => ['93.184.216.34'],
    transport: async () => {
      throw new Error('no page fetches here');
    },
    fetch: async (url) => {
      urls.push(String(url));

      return new Response(JSON.stringify({ results: [hit] }));
    },
    ...over,
  };
}

const saveResearch = async (config: ConfigSource, doc: Record<string, unknown>) =>
  config.append({
    scope: 'company',
    doc: { research: doc },
    author: 'test',
    reason: 'test',
    expectedVersion: (await config.company()).version,
  });

describe('the live provider', () => {
  it('searches the built-in SearXNG until the owner saves another provider, then follows the save', async () => {
    const config = createMemoryConfigSource();
    const n = net();
    const wiring = buildResearchWiring(config, n);

    expect(wiring.provider.capabilities().provider).toBe('searxng');
    expect((await wiring.provider.search('a query', { maxResults: 3 })).ok).toBe(true);
    expect(n.urls[0]).toContain('http://localhost:8888/search');

    await saveResearch(config, {
      searxng: { base_url: 'http://localhost:7777', allow_hosts: [] },
    });

    await wiring.provider.search('a query', { maxResults: 3 });
    expect(n.urls[1]).toContain('http://localhost:7777/search');

    await saveResearch(config, { provider: 'none' });
    const off = await wiring.provider.search('a query', { maxResults: 3 });

    expect(wiring.provider.capabilities().provider).toBe('none');
    expect(off).toMatchObject({ ok: false, error: { kind: 'not_configured' } });
    expect(n.urls).toHaveLength(2);
  });

  it('refresh() picks a saved change up before any call, and a failing settings read keeps the working provider', async () => {
    const config = createMemoryConfigSource();
    const wiring = buildResearchWiring(config, net());

    await saveResearch(config, { provider: 'none' });
    await wiring.refresh();
    expect(wiring.provider.capabilities().provider).toBe('none');

    const broken: ConfigSource = {
      ...config,
      company: async () => {
        throw new Error('settings do not load');
      },
    };

    const kept = buildResearchWiring(broken, net());
    await kept.refresh();

    expect(kept.provider.capabilities().provider).toBe('searxng');
    expect((await kept.provider.search('a query', { maxResults: 1 })).ok).toBe(true);
  });
});

describe('test()', () => {
  it('reports latency for a provider that answers, using the saved settings by default', async () => {
    const wiring = buildResearchWiring(createMemoryConfigSource(), net());

    const reply = await wiring.test();

    expect(reply).toMatchObject({ ok: true, provider: 'searxng' });
    expect(reply.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('tests unsaved settings, and reports the typed error when the server does not answer', async () => {
    const config = createMemoryConfigSource();
    const wiring = buildResearchWiring(
      config,
      net({
        fetch: async () => {
          throw new TypeError('fetch failed');
        },
      }),
    );

    const reply = await wiring.test({
      provider: 'searxng',
      searxng: { base_url: 'http://localhost:7777', allow_hosts: [] },
      fetch: { allow_hosts: [], deny_hosts: [], timeout_ms: 3000 },
    });

    expect(reply).toMatchObject({
      ok: false,
      provider: 'searxng',
      error: { kind: 'unreachable' },
    });

    expect((await config.company()).version).toBe(0);
  });

  it('explains provider none as not configured', async () => {
    const wiring = buildResearchWiring(createMemoryConfigSource(), net());

    const reply = await wiring.test({
      provider: 'none',
      searxng: { base_url: 'http://localhost:8888', allow_hosts: [] },
      fetch: { allow_hosts: [], deny_hosts: [], timeout_ms: 3000 },
    });

    expect(reply).toMatchObject({
      ok: false,
      provider: 'none',
      error: { kind: 'not_configured' },
    });
  });
});
