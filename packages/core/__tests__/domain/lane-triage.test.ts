/**
 * Tests for glob matching and the lane pre-check.
 *
 * Why: lane escalation is one-way and deterministic; property tests guard monotonicity
 *   (code.md rule 8).
 *
 * Pins: globMatch semantics (`*`, `**`, `?`, Windows separators, literal
 *   metacharacters); express by default, tier-C hit forces full, more than 3 files /
 *   long body / ci raise to standard, lane never lowered (director-core.md §6 step 1;
 *   execution-plane.md §2).
 * Depends on: src/shared/glob, src/domain/lane-triage, src/schemas/ticket, fast-check,
 *   vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { globMatch } from '#/shared/glob.js';
import { maxLane, preCheckLane } from '#/domain/lane-triage.js';
import { Lane } from '#/schemas/ticket.js';

const base = {
  tierCGlobs: ['packages/db/migrations/**', '**/auth/**'],
  bodyLength: 100,
  type: 'fix',
} as const;

describe('globMatch', () => {
  it('handles *, **, ? and windows separators', () => {
    expect(globMatch('packages/db/migrations/**', 'packages/db/migrations/001.sql')).toBe(
      true,
    );
    expect(globMatch('**/auth/**', 'apps/server/src/auth/login.ts')).toBe(true);
    expect(globMatch('src/*.ts', 'src/a.ts')).toBe(true);
    expect(globMatch('src/*.ts', 'src/x/a.ts')).toBe(false);
    expect(globMatch('a?c', 'abc')).toBe(true);
    expect(
      globMatch('packages/db/migrations/**', 'packages\\db\\migrations\\001.sql'),
    ).toBe(true);
  });

  it('treats regex metacharacters literally', () => {
    expect(globMatch('a.b', 'axb')).toBe(false);
    expect(globMatch('a+(b)', 'a+(b)')).toBe(true);
  });
});

describe('preCheckLane', () => {
  it('is express for a small change', () => {
    const r = preCheckLane({ ...base, touchedPaths: ['src/a.ts'] });
    expect(r.lane).toBe('express');
    expect(r.reasons).toEqual([]);
  });

  it('forces full on a tier-C glob hit', () => {
    const r = preCheckLane({ ...base, touchedPaths: ['packages/db/migrations/1.sql'] });
    expect(r.lane).toBe('full');
    expect(r.reasons.join()).toMatch(/tier-C/);
  });

  it('goes at least standard above 3 files', () => {
    const paths = (n: number) => Array.from({ length: n }, (_, i) => `src/f${i}.ts`);
    expect(preCheckLane({ ...base, touchedPaths: paths(3) }).lane).toBe('express');
    expect(preCheckLane({ ...base, touchedPaths: paths(4) }).lane).toBe('standard');
    expect(preCheckLane({ ...base, touchedPaths: paths(9) }).lane).toBe('standard');
  });

  it('long bodies and ci changes are at least standard', () => {
    expect(preCheckLane({ ...base, bodyLength: 5000 }).lane).toBe('standard');
    expect(preCheckLane({ ...base, type: 'ci' }).lane).toBe('standard');
  });

  it('never lowers a lane supplied by an earlier step', () => {
    const r = preCheckLane({ ...base, touchedPaths: ['src/a.ts'], currentLane: 'full' });
    expect(r.lane).toBe('full');
  });

  it('property: result >= currentLane; maxLane is commutative and idempotent', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Lane.options),
        fc.constantFrom(...Lane.options),
        fc.array(fc.string(), { maxLength: 10 }),
        fc.nat(10000),
        (a, b, paths, len) => {
          expect(maxLane(a, b)).toBe(maxLane(b, a));
          expect(maxLane(a, a)).toBe(a);
          const r = preCheckLane({
            tierCGlobs: [],
            touchedPaths: paths,
            bodyLength: len,
            type: 'feat',
            currentLane: a,
          });
          expect(maxLane(r.lane, a)).toBe(r.lane);
        },
      ),
    );
  });
});
