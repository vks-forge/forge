/**
 * Pins: the dev proxy maps `/api/x` to `/x`, drops any Authorization header the page sent,
 * adds the install token from the data home on the server side, re-reads it on every request,
 * and never prints it.
 *
 * Why: the install token can start Workers on this machine. It must reach Forge only as a
 *   header added here, never be readable by page scripts, survive a server restart (the server
 *   writes a new token), nor appear in a log. A page-supplied header must not be able to
 *   impersonate the proxy either.
 * Depends on: vite.forge-proxy. IO: a temporary data home on disk.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgeProxy, readInstallToken } from '#root/vite.forge-proxy.js';

const TOKEN_A = 'A'.repeat(43);
const TOKEN_B = 'b-_'.repeat(14) + 'b';

let home: string;
const tokenFile = (): string => join(home, 'install-token');

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'forge-web-proxy-'));
  vi.stubEnv('FORGE_HOME', home);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(home, { recursive: true, force: true });
});

/** Runs the proxy's `proxyReq` hook for one request and returns the headers it set. */
async function outgoingHeaders(pageHeader?: string): Promise<Record<string, string>> {
  const config = (await forgeProxy())['/api'];
  const handlers = new Map<string, (req: unknown) => void>();
  const headers: Record<string, string> = pageHeader ? { authorization: pageHeader } : {};
  const request = {
    removeHeader: (name: string) => delete headers[name],
    setHeader: (name: string, value: string) => (headers[name] = value),
  };

  (config as { configure: (proxy: unknown) => void }).configure({
    on: (event: string, handler: (req: unknown) => void) => handlers.set(event, handler),
  });

  handlers.get('proxyReq')?.(request);

  return headers;
}

describe('readInstallToken', () => {
  const read = (text: string | undefined) =>
    readInstallToken({ tokenPath: () => 'x', readText: () => text });

  it('accepts a well-formed token and trims the newline', () => {
    expect(read(`${TOKEN_A}\n`)).toBe(TOKEN_A);
  });

  it('treats a missing, short or odd file as no token instead of throwing', () => {
    expect(read(undefined)).toBeUndefined();
    expect(read('short')).toBeUndefined();
    expect(read(`${TOKEN_A} extra`)).toBeUndefined();
  });

  it('treats an unreadable file as no token', () => {
    expect(
      readInstallToken({
        tokenPath: () => 'x',
        readText: () => {
          throw new Error('EACCES');
        },
      }),
    ).toBeUndefined();
  });
});

describe('forgeProxy', () => {
  it('forwards /api to the loopback server with the prefix stripped', async () => {
    const config = (await forgeProxy())['/api'] as {
      target: string;
      changeOrigin: boolean;
      rewrite: (path: string) => string;
    };

    expect(config.target).toBe('http://127.0.0.1:4310');
    expect(config.changeOrigin).toBe(true);
    expect(config.rewrite('/api/projects?x=1')).toBe('/projects?x=1');
    expect(config.rewrite('/api/runs/r1/events')).toBe('/runs/r1/events');
  });

  it('adds the bearer token from the data home', async () => {
    writeFileSync(tokenFile(), `${TOKEN_A}\n`);

    expect((await outgoingHeaders())['authorization']).toBe(`Bearer ${TOKEN_A}`);
  });

  it('replaces an Authorization header supplied by the page', async () => {
    writeFileSync(tokenFile(), TOKEN_A);

    expect((await outgoingHeaders('Bearer attacker'))['authorization']).toBe(
      `Bearer ${TOKEN_A}`,
    );
  });

  it('sends no Authorization at all when there is no token, and never forwards the page one', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const headers = await outgoingHeaders('Bearer attacker');

    expect(headers['authorization']).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('re-reads the file for every request, so a restarted server works without a reload', async () => {
    writeFileSync(tokenFile(), TOKEN_A);
    const config = (await forgeProxy())['/api'] as { configure: (p: unknown) => void };
    const handlers = new Map<string, (req: unknown) => void>();
    config.configure({
      on: (e: string, h: (req: unknown) => void) => handlers.set(e, h),
    });

    const seen: string[] = [];
    const request = {
      removeHeader: () => undefined,
      setHeader: (_: string, value: string) => seen.push(value),
    };

    handlers.get('proxyReq')?.(request);
    writeFileSync(tokenFile(), TOKEN_B);
    handlers.get('proxyReq')?.(request);

    expect(seen).toEqual([`Bearer ${TOKEN_A}`, `Bearer ${TOKEN_B}`]);
  });

  it('never prints the token', async () => {
    writeFileSync(tokenFile(), TOKEN_A);
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
    ];

    await outgoingHeaders();
    writeFileSync(tokenFile(), 'broken');
    await outgoingHeaders();

    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN_A);
    }
  });
});
