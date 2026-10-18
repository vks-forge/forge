/**
 * Pins who signs finished work: the Director for low-risk work that passed everything, else you.
 *
 * Why: the Director may take the routine click off the owner (d-0137) only when nothing is in
 *   doubt, and tier C (auth, migrations, secrets) must always be a named person (d-0012, d-0141
 *   item 9). The decision is deterministic, with no second model call that could be talked into
 *   agreeing, and it fails closed: an unknown signer setting, an unknown tier, any check that did
 *   not plainly pass, any owner override, or a step that errored sends the sign-off to the owner
 *   with the reason the Director declined, so the owner can read why.
 *
 * Pins: the happy cases (tier A and B with maxTier B, tier A with maxTier A); never the Director
 *   for tier C, above maxTier, with maxTier none, with a signer of owner, with a failed or
 *   skipped check, with an override or after a step error; every answer carries a non-empty
 *   reason; unknown inputs fall to the owner.
 * Depends on: src/domain/sign-off, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { signOffDecision } from '#/domain/sign-off.js';
import type { SignOffInput } from '#/types/sign-off.types.js';

const ok: SignOffInput = {
  signer: 'director_or_owner',
  tier: 'B',
  maxTier: 'B',
  checksPassed: true,
  checkPassed: true,
  overrides: 0,
  stepError: false,
};

describe('signOffDecision', () => {
  it('lets the Director sign tier B and tier A when everything passed and maxTier allows', () => {
    expect(signOffDecision(ok).by).toBe('director');
    expect(signOffDecision({ ...ok, tier: 'A' }).by).toBe('director');
    expect(signOffDecision({ ...ok, tier: 'A', maxTier: 'A' }).by).toBe('director');
  });

  it('gives tier C to the owner always', () => {
    const d = signOffDecision({ ...ok, tier: 'C' });

    expect(d.by).toBe('owner');
    expect(d.reason).toMatch(/tier C/i);
  });

  it('gives work above maxTier, and everything when maxTier is none, to the owner', () => {
    expect(signOffDecision({ ...ok, tier: 'B', maxTier: 'A' }).by).toBe('owner');
    expect(signOffDecision({ ...ok, tier: 'A', maxTier: 'none' }).by).toBe('owner');
  });

  it('gives the owner every sign-off whose stage names the owner as signer', () => {
    expect(signOffDecision({ ...ok, signer: 'owner' }).by).toBe('owner');
  });

  it('declines for a failed or skipped check, an override and a step error, and says why', () => {
    const cases: Partial<SignOffInput>[] = [
      { checksPassed: false },
      { checkPassed: false },
      { overrides: 1 },
      { stepError: true },
    ];

    for (const c of cases) {
      const d = signOffDecision({ ...ok, ...c });

      expect(d.by).toBe('owner');
      expect(d.reason.length).toBeGreaterThan(5);
    }
  });

  it('fails closed on a signer or tier it does not know', () => {
    const odd = (patch: object): SignOffInput => ({ ...ok, ...patch }) as SignOffInput;

    expect(signOffDecision(odd({ signer: 'director' })).by).toBe('owner');
    expect(signOffDecision(odd({ tier: 'Z' })).by).toBe('owner');
    expect(signOffDecision(odd({ maxTier: 'C' })).by).toBe('owner');
  });
});

describe('signOffDecision properties', () => {
  const input = fc.record({
    signer: fc.constantFrom('director_or_owner' as const, 'owner' as const),
    tier: fc.constantFrom('A' as const, 'B' as const, 'C' as const),
    maxTier: fc.constantFrom('none' as const, 'A' as const, 'B' as const),
    checksPassed: fc.boolean(),
    checkPassed: fc.boolean(),
    overrides: fc.integer({ min: 0, max: 3 }),
    stepError: fc.boolean(),
  });

  it('never signs tier C, above maxTier, or with a failed or skipped check, an override or an error', () => {
    fc.assert(
      fc.property(input, (i) => {
        const d = signOffDecision(i);
        const rank = { none: 0, A: 1, B: 2, C: 3 } as const;
        if (d.by === 'director') {
          expect(i.tier).not.toBe('C');
          expect(rank[i.tier]).toBeLessThanOrEqual(rank[i.maxTier]);
          expect(i.signer).toBe('director_or_owner');
          expect(i.checksPassed).toBe(true);
          expect(i.checkPassed).toBe(true);
          expect(i.overrides).toBe(0);
          expect(i.stepError).toBe(false);
        }

        expect(d.reason.length).toBeGreaterThan(0);
      }),
    );
  });

  it('signs whenever every condition holds, so the rule is not vacuous', () => {
    fc.assert(
      fc.property(fc.constantFrom('A' as const, 'B' as const), (tier) => {
        expect(signOffDecision({ ...ok, tier }).by).toBe('director');
      }),
    );
  });
});
