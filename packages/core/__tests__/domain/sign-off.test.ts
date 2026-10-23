/**
 * Pins who signs finished work: the Director for low-risk work that passed everything, else you.
 *
 * Why: the Director may take the routine click off the owner (d-0137) only when nothing is in
 *   doubt. Tier C (auth, migrations, secrets, billing) is signed by the Director only on a clean
 *   floor (d-0181): every check passed, no critical or high finding open, the plan check passed, no
 *   secrets path in the diff, no owner override, and the owner has not set Always ask. The decision
 *   is deterministic, with no second model call that could be talked into agreeing, and it fails
 *   closed: any other case sends the sign-off to the owner with the specific reason the Director
 *   declined, so the owner can read why.
 *
 * Pins: the happy cases (tier A, B and clean C); tier C to the owner with the named failing
 *   condition (check, plan check, severe finding, secrets path, override, error, Always ask, ceiling
 *   none, owner signer); never the Director above maxTier, with a signer of owner, with a failed or
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
  openSevere: 0,
  secretsPath: null,
  approvalMode: 'director_or_user',
};

describe('signOffDecision', () => {
  it('lets the Director sign tier B and tier A when everything passed and maxTier allows', () => {
    expect(signOffDecision(ok).by).toBe('director');
    expect(signOffDecision({ ...ok, tier: 'A' }).by).toBe('director');
    expect(signOffDecision({ ...ok, tier: 'A', maxTier: 'A' }).by).toBe('director');
  });

  it('lets the Director sign tier C when the floor is clean, and says so (d-0181)', () => {
    const d = signOffDecision({ ...ok, tier: 'C' });

    expect(d.by).toBe('director');
    expect(d.reason).toMatch(/tier C/i);
  });

  it('gives tier C to the owner with the specific failing condition', () => {
    const c = { ...ok, tier: 'C' } as const;
    const cases: [Partial<SignOffInput>, RegExp][] = [
      [{ checksPassed: false }, /check did not pass/i],
      [{ checkPassed: false }, /plan did not pass/i],
      [{ openSevere: 2 }, /critical or high/i],
      [{ secretsPath: '.env' }, /\.env/],
      [{ overrides: 1 }, /overruled/i],
      [{ stepError: true }, /could not finish/i],
      [{ approvalMode: 'always_ask' }, /always ask/i],
      [{ maxTier: 'none' }, /never to sign/i],
      [{ signer: 'owner' }, /always need you/i],
    ];

    for (const [patch, reason] of cases) {
      const d = signOffDecision({ ...c, ...patch });

      expect(d.by).toBe('owner');
      expect(d.reason).toMatch(reason);
      expect(d.reason).not.toMatch(/^Tier C changes .* always need you/);
    }
  });

  it('keeps the Always ask setting for tier C only: tier B still signs', () => {
    expect(signOffDecision({ ...ok, approvalMode: 'always_ask' }).by).toBe('director');
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
    openSevere: fc.integer({ min: 0, max: 2 }),
    secretsPath: fc.constantFrom(null, '.env'),
    approvalMode: fc.constantFrom('director_or_user' as const, 'always_ask' as const),
  });

  it('never signs above maxTier, or with a failed or skipped check, an override or an error', () => {
    fc.assert(
      fc.property(input, (i) => {
        const d = signOffDecision(i);
        const rank = { none: 0, A: 1, B: 2, C: 3 } as const;
        if (d.by === 'director') {
          if (i.tier === 'C') {
            expect(i.openSevere).toBe(0);
            expect(i.secretsPath).toBeNull();
            expect(i.approvalMode).toBe('director_or_user');
          }

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
      fc.property(fc.constantFrom('A' as const, 'B' as const, 'C' as const), (tier) => {
        expect(signOffDecision({ ...ok, tier }).by).toBe('director');
      }),
    );
  });
});
