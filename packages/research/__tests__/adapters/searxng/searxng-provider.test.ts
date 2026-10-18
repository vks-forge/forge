/**
 * Pins the SearXNG research provider: search, fetch and health.
 *
 * Why: search is the route to outside knowledge for the Director and for Workers, and must reach only the
 *   owner's SearXNG (loopback or allow-listed). A result is untrusted text: it must be capped and stripped
 *   of non-http links. A fetch must come back as a page with a title, a hash and a time so the engine can
 *   store and quote it. An outage must be a typed error, never a throw.
 *
 * Pins: createSearxngProvider() search, fetch, health, error kinds; validateSearxngBase().
 * Depends on: src/index, tests/helpers/fake-network, node:http, vitest.
 */

import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSearxngProvider, validateSearxngBase } from '#/index.js';
import { SETTINGS, fakeNet, htmlPage, jsonResponse } from '#tests/helpers/fake-network.js';

let lastUrl = '';
const fake = createServer((req, res) => {
  lastUrl = req.url ?? '';
  res.setHeader('content-type', 'application/json');
  res.end(
    JSON.stringify({
      results: Array.from({ length: 12 }, (_, i) => ({
        title: `T${i}`,
        url: i === 3 ? 'javascript:alert(1)' : `https://example.com/${i}`,
        content: 'c'.repeat(600),
        extra: 'ignored',
      })),
    }),
  );
});

let base = '';
beforeAll(async () => {
  fake.listen(0, '127.0.0.1');
  await once(fake, 'listening');
  base = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
});

afterAll(() => {
  fake.close();
});

const withBase = (url: string, allow: string[] = []) => ({
  ...SETTINGS,
  searxng: { base_url: url, allow_hosts: allow },
});

describe('search', () => {
  it('queries SearXNG JSON over a real socket and returns capped hits without non-http links', async () => {
    const p = createSearxngProvider(withBase(base), fakeNet({ fetch }));

    const res = await p.search('vitest coverage', { maxResults: 5, engines: ['google', 'github'] });

    expect(res.ok).toBe(true);
    if (!res.ok) {
      return;
    }

    expect(res.value.hits).toHaveLength(5);
    expect(res.value.hits.map((h) => h.url)).not.toContain('javascript:alert(1)');
    expect(Object.keys(res.value.hits[0] ?? {}).sort()).toEqual(['snippet', 'title', 'url']);
    expect(res.value.hits[0]?.snippet.length).toBeLessThanOrEqual(300);
    expect(lastUrl).toContain('format=json');
    expect(lastUrl).toContain('q=vitest+coverage');
    expect(lastUrl).toContain('engines=google%2Cgithub');
  });

  it('refuses a non-loopback base URL unless allow-listed', async () => {
    const denied = createSearxngProvider(withBase('http://search.example.com'), fakeNet());
    const res = await denied.search('x query', { maxResults: 3 });

    expect(res.ok).toBe(false);
    expect(!res.ok && res.error.kind).toBe('denied');

    const allowed = createSearxngProvider(
      withBase('http://search.lan:8888', ['search.lan']),
      fakeNet({ fetch: async () => jsonResponse([{ title: 'a', url: 'https://a.io', content: 'z' }]) }),
    );

    expect((await allowed.search('x query', { maxResults: 3 })).ok).toBe(true);
  });

  it('stops reading an endless body at the cap and reports too_large', async () => {
    let pulled = 0;
    const p = createSearxngProvider(
      withBase(base),
      fakeNet({
        fetch: async () =>
          new Response(
            new ReadableStream({
              pull(ctl) {
                pulled += 1;
                ctl.enqueue(new TextEncoder().encode('x'.repeat(100_000)));
              },
            }),
          ),
      }),
    );

    const res = await p.search('x query', { maxResults: 3 });

    expect(!res.ok && res.error.kind).toBe('too_large');
    expect(pulled).toBeLessThan(40);
  });

  it.each([
    ['an HTTP error', async () => new Response('boom', { status: 500 }), 'http_error'],
    ['a malformed body', async () => new Response('not json'), 'bad_content'],
    [
      'a connection failure',
      async () => {
        throw new TypeError('fetch failed');
      },
      'unreachable',
    ],
    [
      'a timeout',
      async () => {
        throw Object.assign(new Error('t'), { name: 'TimeoutError' });
      },
      'timeout',
    ],
  ])('turns %s into the %s error instead of throwing', async (_name, fetchImpl, kind) => {
    const p = createSearxngProvider(withBase(base), fakeNet({ fetch: fetchImpl }));

    const res = await p.search('x query', { maxResults: 3 });

    expect(!res.ok && res.error.kind).toBe(kind);
  });
});

describe('fetch', () => {
  const opts = { maxBytes: 100_000, timeoutMs: 2_000, allowHosts: [], denyHosts: [] };

  it('returns the page text, title, hash, size and time', async () => {
    const html = '<html><head><title>Widget API</title></head><body><h1>Limits</h1>100 per minute<script>x()</script></body></html>';
    const p = createSearxngProvider(
      SETTINGS,
      fakeNet({ transport: async () => htmlPage(html) }),
      () => new Date('2026-10-18T10:00:00.000Z'),
    );

    const res = await p.fetch('https://example.com/docs', opts);

    expect(res.ok).toBe(true);
    if (!res.ok) {
      return;
    }

    expect(res.value).toMatchObject({
      url: 'https://example.com/docs',
      final_url: 'https://example.com/docs',
      title: 'Widget API',
      truncated: false,
      content_type: 'text/html',
      retrieved_at: '2026-10-18T10:00:00.000Z',
      bytes: Buffer.byteLength(html),
    });

    expect(res.value.text).toContain('100 per minute');
    expect(res.value.text).not.toContain('x()');
    expect(res.value.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses a private address, a banned host and a host outside the allow list', async () => {
    const p = createSearxngProvider(SETTINGS, fakeNet({ transport: async () => htmlPage('x') }));

    expect((await p.fetch('http://10.0.0.1/', opts)).ok).toBe(false);
    expect(
      (await p.fetch('https://a.example.com/', { ...opts, denyHosts: ['example.com'] })).ok,
    ).toBe(false);

    const out = await p.fetch('https://b.example.com/', { ...opts, allowHosts: ['a.example.com'] });
    expect(!out.ok && out.error.kind).toBe('denied');
  });

  it('reports a failing server as a typed error', async () => {
    const p = createSearxngProvider(
      SETTINGS,
      fakeNet({
        transport: async () => {
          throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
        },
      }),
    );

    const res = await p.fetch('https://example.com/', opts);

    expect(!res.ok && res.error.kind).toBe('unreachable');
  });
});

describe('health', () => {
  it('reports latency when SearXNG answers and the error when it does not', async () => {
    const up = createSearxngProvider(withBase(base), fakeNet({ fetch }));
    const ok = await up.health();
    expect(ok.ok).toBe(true);
    expect(ok.ok && ok.value.latency_ms).toBeGreaterThanOrEqual(0);

    const down = createSearxngProvider(
      withBase(base),
      fakeNet({
        fetch: async () => {
          throw new TypeError('fetch failed');
        },
      }),
    );

    const bad = await down.health();
    expect(!bad.ok && bad.error.kind).toBe('unreachable');
  });
});

describe('validateSearxngBase', () => {
  it.each(['ftp://localhost', 'http://user:pw@localhost', 'http://search.example.com'])(
    'refuses %s',
    (url) => {
      expect(() => validateSearxngBase(url)).toThrow();
    },
  );

  it('accepts loopback forms and refuses an empty value', () => {
    expect(validateSearxngBase('http://localhost:8888').hostname).toBe('localhost');
    expect(validateSearxngBase('http://[::1]:8888').port).toBe('8888');
    expect(() => validateSearxngBase(undefined)).toThrow();
  });
});
