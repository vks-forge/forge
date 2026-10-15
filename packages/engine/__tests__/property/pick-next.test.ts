/**
 * Property: the scheduler never breaks a limit, never starves a project, ranks by priority.
 *
 * Why: a few Worker slots are shared by every project on the machine (d-0097). If a limit
 *   could be exceeded, two Workers would fight over one harness account or one repository;
 *   if one project could keep the slots forever, the others' tickets would wait for days with
 *   nothing wrong on screen; if an urgent ticket could start after a routine one in its own
 *   project, priority would mean nothing. Random mixes of projects, harnesses, limits, wakes,
 *   blockers and parked harnesses pin all of it, plus determinism: the same inputs, in any
 *   order, give the same answer, so a ticket page and a dispatch tick never disagree.
 *
 * Pins: no cap exceeded (global, per-project, per-harness, In Progress); blocked and parked
 *   tickets never start; every candidate is picked or has a reason; wakes before new tickets;
 *   within a project priority then ticket number; deterministic and order-independent.
 *   (Fairness across projects is in pick-next-fairness.test.ts.)
 * Depends on: src/domain/pick-next, src/types/pick-next, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { pickNext } from '#/domain/pick-next.js';
import type { PickCandidate, PickCaps, PickRunning } from '#/types/pick-next.types.js';

const NOW = 1_000_000;
const PROJECTS = ['p0', 'p1', 'p2', 'p3', 'p4'];
const HARNESSES = ['h0', 'h1', 'h2'];

const limit = fc.integer({ min: 1, max: 4 });
const partial = (keys: readonly string[]) =>
  fc.dictionary(fc.constantFrom(...keys), limit, { maxKeys: keys.length });

const capsArb: fc.Arbitrary<PickCaps> = fc.record({
  global: limit,
  perProject: fc.record({ default: limit, byProject: partial(PROJECTS) }),
  perHarness: fc.record({ default: limit, byId: partial(HARNESSES) }),
  inProgress: fc.record({ used: fc.integer({ min: 0, max: 4 }), limit }),
  paused: fc.dictionary(
    fc.constantFrom(...HARNESSES),
    fc.record({
      until: fc.integer({ min: NOW - 500, max: NOW + 500 }),
      reason: fc.constant('quota'),
    }),
    { maxKeys: 2 },
  ),
});

const runningArb: fc.Arbitrary<PickRunning[]> = fc.array(
  fc.record({
    project: fc.constantFrom(...PROJECTS),
    harness: fc.constantFrom(...HARNESSES),
  }),
  { maxLength: 5 },
);

/** Unique ids; a project's tickets may sit on different harnesses (a fallback). */
const candidatesArb: fc.Arbitrary<PickCandidate[]> = fc
  .array(
    fc.record({
      project: fc.constantFrom(...PROJECTS),
      harness: fc.constantFrom(...HARNESSES),
      priority: fc.integer({ min: -2, max: 3 }),
      wake: fc.boolean(),
      entering: fc.boolean(),
      blockedBy: fc.array(fc.constantFrom('X-1', 'X-2'), { maxLength: 1 }),
    }),
    { maxLength: 18 },
  )
  .map((rows) =>
    rows.map((r, i) => ({ ...r, id: `${r.project}-${i + 1}`, number: i + 1 })),
  );

const count = <T>(xs: readonly T[], f: (x: T) => boolean): number => xs.filter(f).length;

describe('pickNext: limits', () => {
  it('never exceeds the global, per-project, per-harness or In Progress limit', () => {
    fc.assert(
      fc.property(candidatesArb, runningArb, capsArb, (cands, running, caps) => {
        const { picked } = pickNext(cands, running, caps, NOW);

        if (picked.length > 0) {
          expect(running.length + picked.length).toBeLessThanOrEqual(caps.global);
        }

        for (const project of PROJECTS) {
          const added = count(picked, (p) => p.project === project);
          const cap = caps.perProject.byProject[project] ?? caps.perProject.default;
          if (added > 0) {
            expect(
              count(running, (r) => r.project === project) + added,
            ).toBeLessThanOrEqual(cap);
          }
        }

        for (const harness of HARNESSES) {
          const added = count(picked, (p) => p.harness === harness);
          const cap = caps.perHarness.byId[harness] ?? caps.perHarness.default;
          if (added > 0) {
            expect(
              count(running, (r) => r.harness === harness) + added,
            ).toBeLessThanOrEqual(cap);
          }
        }

        const entering = count(picked, (p) => p.entering);
        if (entering > 0) {
          expect(caps.inProgress.used + entering).toBeLessThanOrEqual(
            caps.inProgress.limit,
          );
        }
      }),
    );
  });

  it('never starts a blocked ticket or one on a parked harness, and explains every ticket it skips', () => {
    fc.assert(
      fc.property(candidatesArb, runningArb, capsArb, (cands, running, caps) => {
        const { picked, waits } = pickNext(cands, running, caps, NOW);

        for (const p of picked) {
          expect(p.blockedBy).toEqual([]);
          expect(caps.paused[p.harness]?.until ?? 0).toBeLessThanOrEqual(NOW);
          expect(waits.has(p.id)).toBe(false);
        }

        expect(picked.length + waits.size).toBe(cands.length);
        for (const c of cands) {
          expect(picked.some((p) => p.id === c.id) || waits.has(c.id)).toBe(true);
        }
      }),
    );
  });

  it('reports a quota wait with the reset time and a deps wait with the open blockers', () => {
    const c = (id: string, harness: string, blockedBy: string[] = []): PickCandidate => ({
      id,
      project: 'p0',
      harness,
      priority: 0,
      number: 1,
      wake: false,
      entering: true,
      blockedBy,
    });

    const caps: PickCaps = {
      global: 5,
      perProject: { default: 5, byProject: {} },
      perHarness: { default: 5, byId: {} },
      inProgress: { used: 0, limit: 5 },
      paused: { h0: { until: NOW + 60_000, reason: 'out of quota' } },
    };

    const { waits } = pickNext([c('a', 'h0'), c('b', 'h1', ['X-1'])], [], caps, NOW);

    expect(waits.get('a')).toEqual({
      kind: 'quota',
      harness: 'h0',
      until: NOW + 60_000,
      reason: 'out of quota',
    });

    expect(waits.get('b')).toEqual({ kind: 'deps', ids: ['X-1'] });
  });
});

describe('pickNext: order', () => {
  const open: PickCaps = {
    global: 99,
    perProject: { default: 99, byProject: {} },
    perHarness: { default: 99, byId: {} },
    inProgress: { used: 0, limit: 99 },
    paused: {},
  };

  const unblocked = (cands: PickCandidate[]): PickCandidate[] =>
    cands.map((c) => ({ ...c, blockedBy: [] }));

  it('starts wakes before new tickets', () => {
    fc.assert(
      fc.property(candidatesArb, (cands) => {
        const { picked } = pickNext(unblocked(cands), [], open, NOW);
        const firstNew = picked.findIndex((p) => !p.wake);

        if (firstNew !== -1) {
          expect(picked.slice(firstNew).every((p) => !p.wake)).toBe(true);
        }
      }),
    );
  });

  it('inside a project, higher priority starts first, then the lower ticket number', () => {
    fc.assert(
      fc.property(candidatesArb, (cands) => {
        const { picked } = pickNext(unblocked(cands), [], open, NOW);

        for (const wake of [true, false]) {
          for (const project of PROJECTS) {
            const mine = picked.filter((p) => p.project === project && p.wake === wake);
            for (let i = 1; i < mine.length; i++) {
              const [a, b] = [mine[i - 1], mine[i]] as [PickCandidate, PickCandidate];

              expect(
                a.priority > b.priority ||
                  (a.priority === b.priority && a.number < b.number),
              ).toBe(true);
            }
          }
        }
      }),
    );
  });

  it('leaves no higher-priority ticket of a project behind a lower one it started', () => {
    fc.assert(
      fc.property(candidatesArb, capsArb, (cands, caps) => {
        const { picked } = pickNext(unblocked(cands), [], { ...caps, paused: {} }, NOW);

        for (const p of picked) {
          const better = cands.filter(
            (c) =>
              c.project === p.project && c.wake === p.wake && c.priority > p.priority,
          );

          // A better ticket may be absent only because a limit stopped it (a harness or
          // In Progress cap that does not bind this one); never because it ranked lower.
          for (const b of better) {
            const bIdx = picked.findIndex((x) => x.id === b.id);
            expect(bIdx === -1 || bIdx < picked.indexOf(p)).toBe(true);
          }
        }
      }),
    );
  });

  it('gives the same answer for the same inputs, in any order', () => {
    fc.assert(
      fc.property(
        candidatesArb,
        runningArb,
        capsArb,
        fc.option(fc.constantFrom(...PROJECTS), { nil: undefined }),
        fc.integer(),
        (cands, running, caps, cursor, seed) => {
          const base = pickNext(cands, running, caps, NOW, cursor);
          const shuffled = [...cands].sort(
            (a, b) => ((a.number * 31 + seed) % 7) - ((b.number * 31 + seed) % 7),
          );

          const again = pickNext(shuffled, running, caps, NOW, cursor);

          expect(again.picked.map((p) => p.id)).toEqual(base.picked.map((p) => p.id));
          expect(pickNext(cands, running, caps, NOW, cursor)).toEqual(base);
          expect(again.cursor).toBe(base.cursor);
        },
      ),
    );
  });
});
