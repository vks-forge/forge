/**
 * Pins: the Director's research requests go through admit() and reach only public http(s) URLs.
 *
 * Why: the research step's requests are written by a model that has just read pages written by
 *   strangers. A `file:` URL, a URL with a password in it, a private or loopback address or a host the
 *   owner banned must never reach the network layer. This is the Director's policy path for outside
 *   facts, so it asks the one `admit()` door under its own grant (Express lane: an `ask` is a deny) and
 *   any input it cannot judge is a deny. The fetcher's DNS-pinned SSRF guard is a second, independent
 *   line; these tests pin the first.
 *
 * Pins: admitResearch(), RESEARCH_TOOL_IDS.
 * Depends on: domain/research-grant, fast-check, vitest. No IO.
 */

import type { ResearchRequest } from '@forge/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { RESEARCH_TOOL_IDS, admitResearch } from '#/domain/research-grant.js';
import type { ResearchLimits } from '#/types/research-limits.types.js';

const open: ResearchLimits = { allowHosts: [], denyHosts: [] };
const fetchOf = (url: string): ResearchRequest =>
  ({ op: 'fetch', url }) as ResearchRequest;

const verdict = (r: ResearchRequest, o: ResearchLimits = open) =>
  admitResearch(r, o).decision;

describe('admitResearch: what is allowed', () => {
  it('exposes exactly web_search and web_fetch', () => {
    expect(RESEARCH_TOOL_IDS).toEqual(['web_search', 'web_fetch']);
  });

  it('allows a search and a public http or https fetch', () => {
    expect(verdict({ op: 'search', query: 'widget api rate limit' })).toBe('allow');
    expect(verdict(fetchOf('https://docs.example.com/a?x=1'))).toBe('allow');
    expect(verdict(fetchOf('http://example.org/'))).toBe('allow');
  });

  it('allows only listed hosts when an allow list is given', () => {
    const o = { allowHosts: ['docs.example.com'], denyHosts: [] };

    expect(verdict(fetchOf('https://docs.example.com/x'), o)).toBe('allow');
    expect(verdict(fetchOf('https://other.example.com/x'), o)).toBe('deny');
  });
});

describe('admitResearch: what is denied', () => {
  it.each([
    'file:///etc/passwd',
    'ftp://example.com/x',
    'javascript:alert(1)',
    'data:text/plain,hi',
    'https://user:pw@example.com/',
    'https://user@example.com/',
    'http://127.0.0.1/',
    'http://10.0.0.5/admin',
    'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data',
    'http://172.16.0.1/',
    'http://[::1]/',
    'http://[fe80::1]/',
    'http://[fd00::1]/',
    'http://localhost/',
    'http://app.localhost/',
    'http://0.0.0.0/',
    'http://[::ffff:10.0.0.1]/',
    'not a url',
    '',
  ])('denies fetching %s', (url) => {
    expect(verdict(fetchOf(url))).toBe('deny');
  });

  it('lets a deny host win over everything, including subdomains', () => {
    const o = { allowHosts: [], denyHosts: ['evil.example.com'] };

    expect(verdict(fetchOf('https://evil.example.com/a'), o)).toBe('deny');
    expect(verdict(fetchOf('https://EVIL.example.com:443/a'), o)).toBe('deny');
    expect(verdict(fetchOf('https://x.evil.example.com/a'), o)).toBe('deny');
    expect(verdict(fetchOf('https://good.example.com/a'), o)).toBe('allow');
  });

  it('denies an empty search query and a query with control characters', () => {
    expect(verdict({ op: 'search', query: '' })).toBe('deny');
    expect(verdict({ op: 'search', query: 'a\u0000b query' })).toBe('deny');
  });

  it('fails closed on input it cannot judge', () => {
    for (const bad of [
      null,
      undefined,
      42,
      {},
      { op: 'exec', cmd: 'ls' },
      { op: 'fetch' },
    ]) {
      expect(admitResearch(bad as unknown as ResearchRequest, open).decision).toBe(
        'deny',
      );
    }
  });

  it('never allows a non-http(s), userinfo or deny-listed url (property)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('file', 'ftp', 'ssh', 'gopher', 'javascript', 'ws'),
        fc.domain(),
        (scheme, host) => {
          expect(verdict(fetchOf(`${scheme}://${host}/x`))).toBe('deny');
        },
      ),
    );

    fc.assert(
      fc.property(
        fc.constantFrom('http', 'https'),
        fc.domain(),
        fc.stringMatching(/^[a-z]{1,8}$/),
        (scheme, host, user) => {
          expect(verdict(fetchOf(`${scheme}://${user}:pw@${host}/x`))).toBe('deny');
          expect(
            admitResearch(fetchOf(`${scheme}://${host}/x`), {
              allowHosts: [],
              denyHosts: [host],
            }).decision,
          ).toBe('deny');
        },
      ),
    );
  });
});
