/**
 * Pins the SSRF-guarded fetch behind `web_fetch`.
 *
 * Why: a Worker reads pages that attackers can write. Without a guard, a page (or a
 *   redirect, or a DNS record that flips after the check) can aim the Forge host at
 *   127.0.0.1 services, the LAN or cloud metadata. Every route to a private address
 *   must be refused before a socket is opened, and size/time caps must bound a hostile
 *   server. A stub resolver and transport make each attack reproducible with no network.
 *
 * Pins: guardedFetchText().
 * Depends on: domain/ssrf-fetch, types/deps.types.
 */

import { describe, expect, it, vi } from 'vitest';
import { guardedFetchText } from '#/domain/ssrf-fetch.js';
import type { DnsResolver, HttpResponse, HttpTransport } from '#/types/deps.types.js';

function res(
  status: number,
  body: string | Uint8Array,
  headers: Record<string, string> = {},
): HttpResponse {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;

  return {
    status,
    headers: { 'content-type': 'text/html', ...headers },
    body: Object.assign(
      (async function* () {
        yield bytes;
      })(),
      { destroy: () => undefined },
    ),
  };
}

const publicDns: DnsResolver = async () => ['93.184.216.34'];
const opts = (transport: HttpTransport, resolve: DnsResolver = publicDns) => ({
  resolve,
  transport,
  allowHosts: [] as string[],
  timeoutMs: 1_000,
  maxBytes: 2 * 1024 * 1024,
});

describe('guardedFetchText: refusals before any socket', () => {
  it.each([
    'http://127.0.0.1/',
    'http://127.0.0.1:8888/search',
    'http://10.0.0.1/',
    'http://[::1]/',
    'http://169.254.169.254/latest/meta-data/',
    'http://2130706433/',
    'http://0x7f.1/',
    'http://[::ffff:127.0.0.1]/',
    'http://localhost/',
    'http://foo.localhost/',
  ])('refuses %s', async (url) => {
    const transport = vi.fn<HttpTransport>();
    await expect(guardedFetchText(url, opts(transport))).rejects.toThrow(
      /private|loopback|blocked|not allowed/i,
    );

    expect(transport).not.toHaveBeenCalled();
  });

  it('refuses a public name whose DNS answer is private (stubbed resolver)', async () => {
    const transport = vi.fn<HttpTransport>();
    await expect(
      guardedFetchText(
        'https://evil.example/',
        opts(transport, async () => ['93.184.216.34', '10.0.0.5']),
      ),
    ).rejects.toThrow(/private|blocked/i);

    expect(transport).not.toHaveBeenCalled();
  });

  it('refuses non-http schemes and embedded credentials', async () => {
    const transport = vi.fn<HttpTransport>();
    await expect(
      guardedFetchText('file:///etc/passwd', opts(transport)),
    ).rejects.toThrow();

    await expect(
      guardedFetchText('ftp://example.com/', opts(transport)),
    ).rejects.toThrow();

    await expect(
      guardedFetchText('https://user:pw@example.com/', opts(transport)),
    ).rejects.toThrow(/credentials/i);

    expect(transport).not.toHaveBeenCalled();
  });

  it('refuses hosts outside a configured allow-list', async () => {
    const transport = vi.fn<HttpTransport>();
    await expect(
      guardedFetchText('https://example.com/', {
        ...opts(transport),
        allowHosts: ['docs.example.org'],
      }),
    ).rejects.toThrow(/allow/i);
  });
});

describe('guardedFetchText: redirects', () => {
  it('refuses a redirect to a private address', async () => {
    const transport = vi.fn<HttpTransport>(async () =>
      res(302, '', { location: 'http://127.0.0.1:8888/' }),
    );

    await expect(
      guardedFetchText('http://example.com/', opts(transport)),
    ).rejects.toThrow(/private|blocked/i);

    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('re-resolves each hop: a redirect to a name that resolves privately is refused', async () => {
    const resolve = vi.fn(async (h: string) =>
      h === 'internal.example' ? ['192.168.0.9'] : ['93.184.216.34'],
    );

    const transport = vi.fn<HttpTransport>(async () =>
      res(301, '', { location: 'https://internal.example/x' }),
    );

    await expect(
      guardedFetchText('https://example.com/', opts(transport, resolve)),
    ).rejects.toThrow(/private|blocked/i);
  });

  it('follows a public redirect and returns the final text', async () => {
    const transport = vi.fn<HttpTransport>(async ({ url }) =>
      url.pathname === '/a' ? res(302, '', { location: '/b' }) : res(200, '<p>done</p>'),
    );

    const out = await guardedFetchText('https://example.com/a', opts(transport));
    expect(out.text).toContain('done');
    expect(out.finalUrl).toBe('https://example.com/b');
  });

  it('stops after 5 redirects', async () => {
    const transport = vi.fn<HttpTransport>(async () =>
      res(302, '', { location: 'https://example.com/loop' }),
    );

    await expect(
      guardedFetchText('https://example.com/', opts(transport)),
    ).rejects.toThrow(/redirect/i);

    expect(transport).toHaveBeenCalledTimes(6);
  });
});

describe('guardedFetchText: bounds and content', () => {
  it('connects to the validated address, not a fresh lookup', async () => {
    const transport = vi.fn<HttpTransport>(async () => res(200, 'ok'));
    await guardedFetchText('https://example.com/', opts(transport));
    expect(transport.mock.calls[0]?.[0].address).toBe('93.184.216.34');
    expect(transport.mock.calls[0]?.[0].family).toBe(4);
  });

  it('truncates at the byte cap and says so', async () => {
    const transport = vi.fn<HttpTransport>(async () =>
      res(200, 'a'.repeat(5_000), { 'content-type': 'text/plain' }),
    );

    const out = await guardedFetchText('https://example.com/', {
      ...opts(transport),
      maxBytes: 1_000,
    });

    expect(out.text.length).toBe(1_000);
    expect(out.truncated).toBe(true);
  });

  it('refuses non-text content types', async () => {
    const transport = vi.fn<HttpTransport>(async () =>
      res(200, 'x', { 'content-type': 'application/octet-stream' }),
    );

    await expect(
      guardedFetchText('https://example.com/', opts(transport)),
    ).rejects.toThrow(/content type/i);
  });

  it('refuses HTTP error statuses', async () => {
    const transport = vi.fn<HttpTransport>(async () => res(404, 'nope'));
    await expect(
      guardedFetchText('https://example.com/', opts(transport)),
    ).rejects.toThrow(/404/);
  });

  it('times out a server that never answers', async () => {
    const transport: HttpTransport = ({ signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      });

    await expect(
      guardedFetchText('https://example.com/', { ...opts(transport), timeoutMs: 20 }),
    ).rejects.toThrow(/timed out/i);
  });
});

describe('guardedFetchText: ports, downgrade and DNS time-box', () => {
  it.each([
    'https://example.com:22/',
    'http://example.com:6379/',
    'https://example.com:8443/',
    'http://example.com:8080/',
  ])('refuses non-web port without an allow-list: %s', async (url) => {
    const transport = vi.fn<HttpTransport>();
    await expect(guardedFetchText(url, opts(transport))).rejects.toThrow(/port/i);
    expect(transport).not.toHaveBeenCalled();
  });

  it('allows 8080/8443 only for an allow-listed host', async () => {
    const transport = vi.fn<HttpTransport>(async () => res(200, 'ok'));
    const out = await guardedFetchText('https://example.com:8443/', {
      ...opts(transport),
      allowHosts: ['example.com'],
    });

    expect(out.text).toBe('ok');
    await expect(
      guardedFetchText('https://example.com:9000/', {
        ...opts(transport),
        allowHosts: ['example.com'],
      }),
    ).rejects.toThrow(/port/i);
  });

  it('allows default and explicit 80/443', async () => {
    const transport = vi.fn<HttpTransport>(async () => res(200, 'ok'));
    await guardedFetchText('http://example.com:80/', opts(transport));
    await guardedFetchText('https://example.com:443/', opts(transport));
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('refuses an https to http redirect downgrade', async () => {
    const transport = vi.fn<HttpTransport>(async () =>
      res(302, '', { location: 'http://example.com/plain' }),
    );

    await expect(
      guardedFetchText('https://example.com/', opts(transport)),
    ).rejects.toThrow(/downgrade/i);

    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('times out a DNS lookup that never answers', async () => {
    const transport = vi.fn<HttpTransport>();
    const started = Date.now();
    await expect(
      guardedFetchText('https://example.com/', {
        ...opts(transport, () => new Promise<string[]>(() => undefined)),
        timeoutMs: 50,
      }),
    ).rejects.toThrow(/timed out/i);

    expect(Date.now() - started).toBeLessThan(2_000);
    expect(transport).not.toHaveBeenCalled();
  });
});
