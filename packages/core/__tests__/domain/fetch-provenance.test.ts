/**
 * Tests for fetch provenance.
 *
 * Why: a fetched page can contain a link written to steer the next fetch somewhere harmful (an
 *   exfiltration URL with the query in it). The research step may therefore fetch only URLs the engine
 *   knows came from this run's search hits, the card or the owner's own answers. The check is a pure
 *   function so no page text can influence it.
 *
 * Pins: known URLs pass, unknown fail, fragments are ignored, scheme and host case are normalised, an
 *   unparsable URL fails; by property only members of the known sets pass.
 * Depends on: src/domain/fetch-provenance, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fetchAllowed } from '#/domain/fetch-provenance.js';

const known = {
  hits: ['https://docs.example.com/a?x=1'],
  cardUrls: ['https://card.example.org/page'],
  answerUrls: ['http://owner.example.net/'],
};

describe('fetchAllowed', () => {
  it('allows a url from each known source', () => {
    expect(fetchAllowed('https://docs.example.com/a?x=1', known)).toBe(true);
    expect(fetchAllowed('https://card.example.org/page', known)).toBe(true);
    expect(fetchAllowed('http://owner.example.net/', known)).toBe(true);
  });

  it('refuses a url that no source named', () => {
    expect(fetchAllowed('https://evil.example.com/?q=secret', known)).toBe(false);
    expect(fetchAllowed('https://docs.example.com/a?x=2', known)).toBe(false);
  });

  it('ignores the fragment and the case of scheme and host', () => {
    expect(fetchAllowed('HTTPS://Docs.Example.COM/a?x=1#frag', known)).toBe(true);
  });

  it('refuses an unparsable url', () => {
    expect(fetchAllowed('not a url', known)).toBe(false);
  });

  it('allows only known urls (property)', () => {
    fc.assert(
      fc.property(fc.webUrl(), fc.array(fc.webUrl(), { maxLength: 4 }), (url, hits) => {
        const ok = fetchAllowed(url, { hits, cardUrls: [], answerUrls: [] });
        const norm = (u: string) => {
          const x = new URL(u);
          x.hash = '';

          return x.href;
        };

        expect(ok).toBe(hits.some((h) => norm(h) === norm(url)));
      }),
    );
  });
});
