/**
 * Pins: the sign-off recommendation leads with evidence taken only from the payload: sign off when
 * every check passed with no open critical/high finding, nothing overruled and no Director
 * objection; otherwise look closer, with each reason named.
 *
 * Why: the owner signs the one irreversible step. A recommendation that said "sign off" over open
 *   serious findings, an overruled hold or a Director's objection would push the owner toward a
 *   merge the evidence does not support; one that claimed "matches the plan" after an override would
 *   be invented.
 * Depends on: src/domain/finished-work-copy. Pure.
 */

import { describe, expect, it } from 'vitest';
import { signOffRecommendation } from '#/domain/finished-work-copy.js';

const clean = {
  tier: 'B' as const,
  checks: {
    passed: 3,
    counts: { critical: 0, high: 0, medium: 1, low: 0 },
    overrides: 0,
  },
};

describe('signOffRecommendation', () => {
  it('recommends signing off with its evidence when all passed and nothing was overruled', () => {
    expect(signOffRecommendation(clean)).toEqual({
      verdict: 'sign_off',
      line: 'Recommend: sign off. All checks passed (3), 0 critical/high, matches the plan.',
    });
  });

  it('tells the owner to look at what changed on protected files, without claiming only they can sign', () => {
    const line = signOffRecommendation({ ...clean, tier: 'C' }).line;

    expect(line).toMatch(/protected files, so look at what changed before you sign\.$/);
    expect(line).not.toMatch(/only you/);
  });

  it('asks to look closer, naming each reason', () => {
    const out = signOffRecommendation({
      tier: 'B',
      checks: {
        passed: 2,
        counts: { critical: 1, high: 1, medium: 0, low: 0 },
        overrides: 1,
      },
      director_note: 'One acceptance criterion could not be confirmed.',
    });

    expect(out.verdict).toBe('look_closer');
    expect(out.line).toContain('2 critical/high findings are still open.');
    expect(out.line).toContain('you overruled 1 held finding');
    expect(out.line).toContain('the Director did not sign it off');
  });

  it('does not recommend when no check is on record as passed', () => {
    expect(
      signOffRecommendation({ ...clean, checks: { ...clean.checks, passed: 0 } }).verdict,
    ).toBe('look_closer');
  });
});
