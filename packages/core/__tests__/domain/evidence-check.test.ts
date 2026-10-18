/**
 * Tests for the evidence check (quote verification).
 *
 * Why: the research step's model reads pages written by strangers and then reports "facts" with quotes.
 *   If its word were enough, a hostile page or a hallucination would become evidence the plan rests on and
 *   the approval floor would trust. The engine, not the model, decides: a claim is verified only when at
 *   least one of its quotes really appears in the stored text of the source it names. Properties pin that
 *   the status is a function of the texts alone, never of the claim wording or of an unknown source.
 *
 * Pins: quote found (case and whitespace insensitive) verifies; an invented quote or an unknown source
 *   does not; a claim with no quote is unverified; only verified quotes are kept; status is independent of
 *   the claim wording; verified iff some quote is a normalised substring of its named source.
 * Depends on: src/domain/evidence-check, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkClaims, normaliseForQuote } from '#/domain/evidence-check.js';

const PAGE = 'The  Widget API\nrate limit is 100 requests per MINUTE for every key.';
const sources = [{ ref: 'S1', text: PAGE }];
const claim = (text: string, quotes: { source: string; quote: string }[]) => ({
  text,
  quotes,
});

describe('checkClaims', () => {
  it('verifies a claim whose quote is on the page, ignoring case and whitespace', () => {
    const [r] = checkClaims(
      [
        claim('The limit is 100 per minute', [
          { source: 'S1', quote: 'rate LIMIT is 100 requests per minute' },
        ]),
      ],
      sources,
    );

    expect(r?.status).toBe('verified');
    expect(r?.sources).toEqual(['S1']);
    expect(r?.quotes).toHaveLength(1);
  });

  it('marks a claim with an invented quote unverified and keeps no quote', () => {
    const [r] = checkClaims(
      [
        claim('The limit is 1000 per minute', [
          { source: 'S1', quote: 'rate limit is 1000 requests per minute' },
        ]),
      ],
      sources,
    );

    expect(r?.status).toBe('unverified');
    expect(r?.quotes).toEqual([]);
  });

  it('never verifies a quote that names an unknown source', () => {
    const [r] = checkClaims(
      [
        claim('The limit is 100 per minute', [
          { source: 'S9', quote: 'rate limit is 100 requests per minute' },
        ]),
      ],
      sources,
    );

    expect(r?.status).toBe('unverified');
    expect(r?.sources).toEqual([]);
  });

  it('marks a claim with no quotes unverified', () => {
    const [r] = checkClaims([claim('Something true, honestly', [])], sources);

    expect(r?.status).toBe('unverified');
  });

  it('keeps only the verified quotes of a claim with one good and one bad quote', () => {
    const good = { source: 'S1', quote: 'limit is 100 requests per minute' };
    const bad = { source: 'S1', quote: 'limit is 5 requests per minute for everyone' };

    const [r] = checkClaims([claim('Limit text for the widget', [bad, good])], sources);

    expect(r?.status).toBe('verified');
    expect(r?.quotes).toEqual([good]);
  });

  it('does not let the claim wording change the status (property)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 10, maxLength: 200 }), (text) => {
        const quotes = [{ source: 'S1', quote: 'rate limit is 100 requests per minute' }];
        const bad = [{ source: 'S1', quote: 'nothing like this is on the page at all' }];

        expect(checkClaims([claim(text, quotes)], sources)[0]?.status).toBe('verified');
        expect(checkClaims([claim(text, bad)], sources)[0]?.status).toBe('unverified');
      }),
    );
  });

  it('is verified iff some quote is a normalised substring of its named source (property)', () => {
    const word = fc.stringMatching(/^[A-Za-z0-9 \n]{20,40}$/);

    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            ref: fc.constantFrom('S1', 'S2'),
            text: fc.string({ maxLength: 120 }),
          }),
          { minLength: 1, maxLength: 2 },
        ),
        fc.array(fc.record({ source: fc.constantFrom('S1', 'S2', 'S3'), quote: word }), {
          maxLength: 3,
        }),
        (srcs, quotes) => {
          const [r] = checkClaims([claim('a claim long enough', quotes)], srcs);
          const expected = quotes.some((q) => {
            const q2 = normaliseForQuote(q.quote);

            return (
              q2 !== '' &&
              srcs.some(
                (s) => s.ref === q.source && normaliseForQuote(s.text).includes(q2),
              )
            );
          });

          expect(r?.status === 'verified').toBe(expected);
        },
      ),
    );
  });
});

describe('normaliseForQuote', () => {
  it('lower-cases and collapses whitespace', () => {
    expect(normaliseForQuote('  A\n\tB   c ')).toBe('a b c');
  });
});
