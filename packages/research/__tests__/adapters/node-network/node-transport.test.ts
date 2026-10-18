/**
 * Pins the real socket transport used by `web_fetch`.
 *
 * Why: the SSRF guard is only as good as the socket actually connecting to the address
 *   it validated. This test proves the transport dials the pinned IP (here a local fake
 *   server) while the Host header keeps the original name, so a DNS answer that changes
 *   after validation cannot redirect the connection.
 *
 * Pins: nodeTransport(), systemResolve().
 * Depends on: adapters/node-network/node-transport, adapters/node-network/system-dns, node:http.
 */

import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nodeTransport } from '#/adapters/node-network/node-transport.js';
import { systemResolve } from '#/adapters/node-network/system-dns.js';

let seenHost: string | undefined;
const server = createServer((req, res) => {
  seenHost = req.headers.host;
  res.setHeader('content-type', 'text/plain');
  res.end('pinned');
});

let port = 0;

beforeAll(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  server.close();
});

describe('nodeTransport', () => {
  it('connects to the supplied address and keeps the original Host header', async () => {
    const res = await nodeTransport({
      url: new URL(`http://example.test:${port}/p`),
      address: '127.0.0.1',
      family: 4,
      signal: new AbortController().signal,
    });

    const chunks: Uint8Array[] = [];
    for await (const c of res.body) {
      chunks.push(c);
    }

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/plain');
    expect(Buffer.concat(chunks).toString()).toBe('pinned');
    expect(seenHost).toBe(`example.test:${port}`);
  });
});

describe('systemResolve', () => {
  it('resolves localhost to loopback addresses', async () => {
    const addrs = await systemResolve('localhost');
    expect(addrs.length).toBeGreaterThan(0);
    expect(addrs.some((a) => a === '127.0.0.1' || a === '::1')).toBe(true);
  });
});
