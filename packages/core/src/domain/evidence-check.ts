/**
 * Evidence check — the engine's verdict on a model's research claims.
 *
 * Why: the research step's model reads pages written by strangers and reports facts with quotes. Its word
 *   proves nothing (d-0001): a hallucinated quote or a page that talked the model into a claim would
 *   otherwise become evidence the plan and the approval floor trust. A claim is `verified` only when at
 *   least one of its quotes, compared without regard to case or whitespace, is a substring of the stored
 *   text of the source it names; the status never depends on the claim's wording or anything the model
 *   says about itself. Quotes that do not match are dropped, so nothing unchecked is stored as a quote.
 *
 * Exports: checkClaims(), normaliseForQuote().
 * Depends on: schemas/research, types/evidence-check. No IO.
 */

import type { ResearchClaim } from '#/schemas/research.js';
import type { CheckedClaim, SourceText } from '#/types/evidence-check.types.js';

/** Lower-cases and collapses every run of whitespace to one space. */
export function normaliseForQuote(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

const unique = (xs: readonly string[]): string[] => [...new Set(xs)];

/** Checks each claim's quotes against the stored page text; the model never sets the status. */
export function checkClaims(
  claims: readonly Pick<ResearchClaim, 'text' | 'question' | 'quotes'>[],
  sources: readonly SourceText[],
): CheckedClaim[] {
  const pages = new Map(sources.map((s) => [s.ref, normaliseForQuote(s.text)]));

  return claims.map((claim) => {
    const verified = claim.quotes.filter((q) => {
      const page = pages.get(q.source);
      const needle = normaliseForQuote(q.quote);

      return page !== undefined && needle !== '' && page.includes(needle);
    });

    const named = claim.quotes.map((q) => q.source).filter((ref) => pages.has(ref));

    return {
      claim: {
        text: claim.text,
        ...(claim.question === undefined ? {} : { question: claim.question }),
      },
      quotes: verified,
      sources: unique(verified.length > 0 ? verified.map((q) => q.source) : named),
      status: verified.length > 0 ? 'verified' : 'unverified',
    };
  });
}
