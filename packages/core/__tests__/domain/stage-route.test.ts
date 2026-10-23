/**
 * Pins where blocking findings go: back for rework, held for the owner, or the rework cap.
 *
 * Why: the same stop (a failed gate, a reviewer's blocking finding, the Director's check) must
 *   not always mean the same road. A deterministic gate has no "merge anyway": it blocks until
 *   the work is fixed, and at the cap the owner chooses Retry, Re-plan or Cancel. A reviewer or
 *   the Director check may be overruled by the owner, so after the automatic reworks are spent
 *   its findings hold the ticket instead of dead-ending it (d-0165, d-0071), and a stage set to
 *   hold never spends a rework at all. One pure rule keeps every phase on the same road.
 *
 * Pins: a gate never routes to hold; a check or Director check never routes to rework at or past
 *   the cap; a hold policy on a check always routes to hold; below the cap a rework policy
 *   reworks; gates at the cap say rework_cap; and the exact table for each class.
 * Depends on: src/domain/stage-route, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { blockingRoute } from '#/domain/stage-route.js';

const policy = fc.constantFrom('rework' as const, 'hold' as const);
const checkKlass = fc.constantFrom('check' as const, 'director_check' as const);
const count = fc.integer({ min: 0, max: 6 });
const cap = fc.integer({ min: 1, max: 4 });

describe('blockingRoute table', () => {
  it('reworks a gate below the cap and ends at rework_cap at it, whatever the policy says', () => {
    expect(
      blockingRoute({ klass: 'gate', policy: 'rework', reworkCount: 1, cap: 2 }),
    ).toBe('rework');

    expect(
      blockingRoute({ klass: 'gate', policy: 'rework', reworkCount: 2, cap: 2 }),
    ).toBe('rework_cap');

    expect(blockingRoute({ klass: 'gate', policy: 'hold', reworkCount: 0, cap: 2 })).toBe(
      'rework',
    );
  });

  it('reworks a check below the cap and holds it at the cap', () => {
    expect(
      blockingRoute({ klass: 'check', policy: 'rework', reworkCount: 0, cap: 2 }),
    ).toBe('rework');

    expect(
      blockingRoute({ klass: 'check', policy: 'rework', reworkCount: 1, cap: 2 }),
    ).toBe('rework');

    expect(
      blockingRoute({ klass: 'check', policy: 'rework', reworkCount: 2, cap: 2 }),
    ).toBe('hold');
  });

  it('holds a hold-policy check at once, without spending a rework', () => {
    expect(
      blockingRoute({ klass: 'check', policy: 'hold', reworkCount: 0, cap: 2 }),
    ).toBe('hold');

    expect(
      blockingRoute({ klass: 'director_check', policy: 'hold', reworkCount: 0, cap: 2 }),
    ).toBe('hold');
  });
});

describe('blockingRoute for a config-only gate failure (d-0173)', () => {
  it('holds a gate failure that is only gate configuration, with no rework spent', () => {
    expect(
      blockingRoute({
        klass: 'gate',
        policy: 'rework',
        reworkCount: 0,
        cap: 2,
        configOnly: true,
      }),
    ).toBe('hold');
  });

  it('treats configOnly false like absent: rework, then the cap', () => {
    expect(
      blockingRoute({
        klass: 'gate',
        policy: 'rework',
        reworkCount: 0,
        cap: 2,
        configOnly: false,
      }),
    ).toBe('rework');

    expect(
      blockingRoute({
        klass: 'gate',
        policy: 'rework',
        reworkCount: 2,
        cap: 2,
        configOnly: false,
      }),
    ).toBe('rework_cap');
  });
});

describe('blockingRoute for a provenance-only gate failure (F-D3)', () => {
  it('sends it back for rework while the cap allows, since a rewrite can fix it', () => {
    for (const reworkCount of [0, 1]) {
      expect(
        blockingRoute({
          klass: 'gate',
          policy: 'rework',
          reworkCount,
          cap: 2,
          provenanceOnly: true,
        }),
      ).toBe('rework');
    }
  });

  it('holds for the owner once the automatic reworks are spent, never the rework cap', () => {
    expect(
      blockingRoute({
        klass: 'gate',
        policy: 'rework',
        reworkCount: 2,
        cap: 2,
        provenanceOnly: true,
      }),
    ).toBe('hold');
  });

  it('treats provenanceOnly false like absent, and ignores it for checks', () => {
    expect(
      blockingRoute({
        klass: 'gate',
        policy: 'rework',
        reworkCount: 2,
        cap: 2,
        provenanceOnly: false,
      }),
    ).toBe('rework_cap');

    expect(
      blockingRoute({
        klass: 'check',
        policy: 'rework',
        reworkCount: 0,
        cap: 2,
        provenanceOnly: true,
      }),
    ).toBe('rework');
  });
});

describe('blockingRoute properties', () => {
  it('always holds a config-only gate failure, whatever the policy or rework count', () => {
    fc.assert(
      fc.property(policy, count, cap, (p, n, c) => {
        expect(
          blockingRoute({
            klass: 'gate',
            policy: p,
            reworkCount: n,
            cap: c,
            configOnly: true,
          }),
        ).toBe('hold');
      }),
    );
  });

  it('ignores configOnly for checks', () => {
    fc.assert(
      fc.property(checkKlass, policy, count, cap, (k, p, n, c) => {
        expect(
          blockingRoute({
            klass: k,
            policy: p,
            reworkCount: n,
            cap: c,
            configOnly: true,
          }),
        ).toBe(blockingRoute({ klass: k, policy: p, reworkCount: n, cap: c }));
      }),
    );
  });

  it('never routes a gate to hold unless its failure is gate configuration only', () => {
    fc.assert(
      fc.property(policy, count, cap, (p, n, c) => {
        expect(
          blockingRoute({ klass: 'gate', policy: p, reworkCount: n, cap: c }),
        ).not.toBe('hold');
      }),
    );
  });

  it('never routes a check past the cap to rework', () => {
    fc.assert(
      fc.property(checkKlass, policy, count, cap, (k, p, n, c) => {
        fc.pre(n >= c);

        expect(blockingRoute({ klass: k, policy: p, reworkCount: n, cap: c })).not.toBe(
          'rework',
        );
      }),
    );
  });

  it('always holds a hold-policy check', () => {
    fc.assert(
      fc.property(checkKlass, count, cap, (k, n, c) => {
        expect(blockingRoute({ klass: k, policy: 'hold', reworkCount: n, cap: c })).toBe(
          'hold',
        );
      }),
    );
  });

  it('never answers rework_cap for a check', () => {
    fc.assert(
      fc.property(checkKlass, policy, count, cap, (k, p, n, c) => {
        expect(blockingRoute({ klass: k, policy: p, reworkCount: n, cap: c })).not.toBe(
          'rework_cap',
        );
      }),
    );
  });
});
