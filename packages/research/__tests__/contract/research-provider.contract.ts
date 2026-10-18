/**
 * Contract every ResearchProvider must satisfy.
 *
 * Why: the engine and the MCP server rely on one behaviour from any provider: a call never throws, an
 *   outage or a refusal is a typed error, and a URL that must never be fetched (a private address, a
 *   non-http scheme, a banned host) is refused whatever backend is behind it. Each new adapter passes this
 *   before it gets its own tests (code.md rule 8).
 *
 * Exports: describeResearchContract().
 * Depends on: @forge/core (types), vitest.
 */

import type { ResearchProvider } from '@forge/core';
import { describe, expect, it } from 'vitest';

const FETCH = { maxBytes: 100_000, timeoutMs: 2_000, allowHosts: [], denyHosts: [] };

/** Runs the contract against providers built by `make`. */
export function describeResearchContract(
  name: string,
  make: () => ResearchProvider,
  provider: string,
): void {
  describe(`ResearchProvider contract: ${name}`, () => {
    it('declares its provider id', () => {
      expect(make().capabilities().provider).toBe(provider);
    });

    it.each(['http://127.0.0.1/', 'http://10.0.0.1/x', 'http://[::1]/', 'file:///etc/passwd', 'ftp://example.com/'])(
      'refuses to fetch %s with a typed error',
      async (url) => {
        const res = await make().fetch(url, FETCH);

        expect(res.ok).toBe(false);
        if (!res.ok) {
          expect(['denied', 'not_configured']).toContain(res.error.kind);
          expect(res.error.message.length).toBeGreaterThan(0);
        }
      },
    );

    it('refuses a deny-listed host', async () => {
      const res = await make().fetch('https://blocked.example.com/a', {
        ...FETCH,
        denyHosts: ['blocked.example.com'],
      });

      expect(res.ok).toBe(false);
    });

    it('never throws from search, fetch or health', async () => {
      const p = make();

      await expect(p.search('anything at all', { maxResults: 3 })).resolves.toBeDefined();
      await expect(p.fetch('not a url', FETCH)).resolves.toBeDefined();
      await expect(p.health()).resolves.toBeDefined();
    });
  });
}
