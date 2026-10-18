/**
 * Pins web_fetch through the MCP protocol.
 *
 * Why: fetch is the Worker's only route to arbitrary URLs. It must obey the SSRF guard (loopback, private
 *   ranges, DNS that resolves private) or a prompt-injected page turns the host into a proxy for the local
 *   network, and every page a Worker reads must be recorded on its run so a reviewer can only cite what
 *   its run really fetched. Host lists from settings narrow what it reaches.
 *
 * Pins: web_fetch, the worker source row it writes.
 * Depends on: helpers/harness, helpers/auto-close, @forge/research, domain/server.
 */

import { createResearchProvider } from '@forge/research';
import { describe, expect, it } from 'vitest';
import { useAutoClose } from '#tests/helpers/auto-close.js';
import { RUN_ID, SETTINGS, T0, connect, textOf } from '#tests/helpers/harness.js';

const closer = useAutoClose();

const provider = (
  transport: Parameters<typeof createResearchProvider>[1] extends infer N
    ? N extends { transport: infer T }
      ? T
      : never
    : never,
  resolve: () => Promise<string[]> = async () => ['93.184.216.34'],
) =>
  createResearchProvider(
    SETTINGS,
    {
      resolve,
      transport,
      fetch: async () => {
        throw new Error('no search in this test');
      },
    },
    () => new Date(T0),
  );

const page = (body: string) => async () => ({
  status: 200,
  headers: { 'content-type': 'text/html' },
  body: Object.assign(
    (async function* () {
      yield new TextEncoder().encode(body);
    })(),
    { destroy: () => undefined },
  ),
});

describe('web_fetch', () => {
  it.each(['http://127.0.0.1/', 'http://10.0.0.1/', 'http://[::1]/'])(
    'refuses %s as a tool error',
    async (url) => {
      const c = await connect();
      closer.set(c.close);
      const res = await c.client.callTool({ name: 'web_fetch', arguments: { url } });
      expect(res.isError).toBe(true);
    },
  );

  it('refuses DNS that resolves to a private address', async () => {
    const c = await connect({
      research: provider(page('x'), async () => ['10.1.2.3']),
    });

    closer.set(c.close);
    const res = await c.client.callTool({
      name: 'web_fetch',
      arguments: { url: 'https://rebind.example/' },
    });

    expect(res.isError).toBe(true);
  });

  it('returns wrapped text for a public page and records a worker source on the run', async () => {
    const c = await connect({
      research: provider(
        page('<title>Hello page</title><h1>Hello</h1><script>x()</script>'),
      ),
    });

    closer.set(c.close);
    const res = await c.client.callTool({
      name: 'web_fetch',
      arguments: { url: 'https://example.com/' },
    });

    expect(res.isError).toBeFalsy();
    const text = textOf(res);
    expect(text).toContain('Hello');
    expect(text).not.toContain('x()');
    expect(text).toMatch(/<untrusted-content id="[0-9a-f]+"/);

    const rows = await c.storage.transaction((tx) =>
      tx.researchSources.listByRun(RUN_ID),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      origin: 'worker',
      project: 'SF',
      ticket_id: 'SF-1',
      run_id: RUN_ID,
      url: 'https://example.com/',
      title: 'Hello page',
      retrieved_at: T0,
    });

    expect(rows[0]?.card_id).toBeUndefined();
    expect(rows[0]?.ref).toBeUndefined();
    expect(
      await c.storage.transaction((tx) => tx.researchSources.text(rows[0]?.id as number)),
    ).toContain('Hello');
  });

  it('records nothing for a refused fetch and honours the deny list from settings', async () => {
    const c = await connect({
      research: provider(page('x')),
      researchLimits: { allowHosts: [], denyHosts: ['example.com'] },
    });

    closer.set(c.close);
    const res = await c.client.callTool({
      name: 'web_fetch',
      arguments: { url: 'https://docs.example.com/a' },
    });

    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/deny list/i);
    expect(
      await c.storage.transaction((tx) => tx.researchSources.listByRun(RUN_ID)),
    ).toEqual([]);
  });

  it('refuses when no provider is configured', async () => {
    const c = await connect({ research: undefined });
    closer.set(c.close);
    const res = await c.client.callTool({
      name: 'web_fetch',
      arguments: { url: 'https://example.com/' },
    });

    expect(res.isError).toBe(true);
  });
});
