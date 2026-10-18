/**
 * Tests for marking the plan's outside claims.
 *
 * Why: a plan that rests on a fact from outside the repository is only as good as the evidence behind
 *   it. The engine, not the model that wrote the plan, decides whether a claim is supported: every
 *   evidence ref it cites must exist and be verified. A claim with no refs or an invented ref stays
 *   unverified, which the approval floor turns into an owner decision.
 *
 * Pins: supported only when every cited ref exists and is verified; empty refs, unknown refs and
 *   unverified refs are unverified; order and text are kept.
 * Depends on: src/domain/outside-claims, vitest.
 */

import { describe, expect, it } from 'vitest';
import { markOutsideClaims } from '#/domain/outside-claims.js';

const evidence = [
  { ref: 'E1', status: 'verified' as const },
  { ref: 'E2', status: 'unverified' as const },
];

describe('markOutsideClaims', () => {
  it('marks a claim supported when every ref exists and is verified', () => {
    expect(
      markOutsideClaims(
        [{ claim: 'The API limit is 100 per minute', evidence: ['E1'] }],
        evidence,
      ),
    ).toEqual([
      { claim: 'The API limit is 100 per minute', evidence: ['E1'], status: 'supported' },
    ]);
  });

  it.each([
    ['no refs', []],
    ['an unknown ref', ['E9']],
    ['an unverified ref', ['E2']],
    ['one good and one unverified ref', ['E1', 'E2']],
  ])('marks a claim with %s unverified', (_n, refs) => {
    const [r] = markOutsideClaims(
      [{ claim: 'A claim long enough', evidence: refs }],
      evidence,
    );

    expect(r?.status).toBe('unverified');
  });
});
