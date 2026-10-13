/**
 * Pins web_fetch through the MCP protocol.
 *
 * Why: fetch is the Worker's only route to arbitrary URLs. It must obey the SSRF guard
 *   (loopback, private ranges, DNS that resolves private) or a prompt-injected page turns
 *   the host into a proxy for the local network.
 *
 * Pins: web_fetch.
 * Depends on: helpers/harness, helpers/auto-close, domain/server.
 */

import { describe, expect, it } from 'vitest';
import { useAutoClose } from '#tests/helpers/auto-close.js';
import { connect, textOf } from '#tests/helpers/harness.js';

const closer = useAutoClose();

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
    const c = await connect({ resolve: async () => ['10.1.2.3'] });
    closer.set(c.close);
    const res = await c.client.callTool({
      name: 'web_fetch',
      arguments: { url: 'https://rebind.example/' },
    });

    expect(res.isError).toBe(true);
  });

  it('returns wrapped text for a public page', async () => {
    const c = await connect({
      resolve: async () => ['93.184.216.34'],
      transport: async () => ({
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: Object.assign(
          (async function* () {
            yield new TextEncoder().encode('<h1>Hello</h1><script>x()</script>');
          })(),
          { destroy: () => undefined },
        ),
      }),
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
  });
});
