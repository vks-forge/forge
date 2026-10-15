/**
 * Property: no project starves, and projects take turns.
 *
 * Why: a few Worker slots are shared by every project on the machine (d-0097). If one busy
 *   project could keep the slots, the others' tickets would wait for days with nothing wrong
 *   on screen. The rotation starts after the project that got the last slot, so with any slot
 *   at all every project with work reaches the front within as many ticks as there are
 *   projects, whatever the priorities inside each project.
 *
 * Pins: with N projects each holding work, global limit >= 1 and any per-project limit, every
 *   project gets a slot within N ticks; three projects, two slots: a, b, then c, a, then b, c.
 * Depends on: src/domain/pick-next, src/types/pick-next, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { pickNext } from '#/domain/pick-next.js';
import type { PickCandidate, PickCaps } from '#/types/pick-next.types.js';

const NOW = 1_000_000;
const PROJECTS = ['p0', 'p1', 'p2', 'p3', 'p4'];

describe('pickNext: fairness', () => {
  it('gives every project with work a slot within as many ticks as there are projects', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 1, max: 3 }),
        fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 1, maxLength: 30 }),
        (n, global, perProject, priorities) => {
          const names = PROJECTS.slice(0, n);
          let pool: PickCandidate[] = names.flatMap((project, pi) =>
            Array.from({ length: n + 1 }, (_, k) => ({
              id: `${project}-${k + 1}`,
              project,
              harness: 'h0',
              priority: priorities[(pi * 7 + k) % priorities.length] ?? 0,
              number: k + 1,
              wake: false,
              entering: true,
              blockedBy: [],
            })),
          );

          const caps: PickCaps = {
            global,
            perProject: { default: perProject, byProject: {} },
            perHarness: { default: global, byId: {} },
            inProgress: { used: 0, limit: 99 },
            paused: {},
          };

          const served = new Set<string>();
          let cursor: string | undefined;
          for (let tick = 0; tick < n; tick++) {
            const result = pickNext(pool, [], caps, NOW, cursor);
            cursor = result.cursor;
            for (const p of result.picked) {
              served.add(p.project);
            }

            const gone = new Set(result.picked.map((p) => p.id));
            pool = pool.filter((c) => !gone.has(c.id));
          }

          expect([...served].sort()).toEqual([...names].sort());
        },
      ),
    );
  });

  it('alternates fairly: three projects, global limit 2, one run finishing per tick', () => {
    const caps: PickCaps = {
      global: 2,
      perProject: { default: 1, byProject: {} },
      perHarness: { default: 2, byId: {} },
      inProgress: { used: 0, limit: 99 },
      paused: {},
    };

    let pool: PickCandidate[] = ['a', 'b', 'c'].flatMap((project) =>
      [1, 2, 3].map((k) => ({
        id: `${project}-${k}`,
        project,
        harness: 'h0',
        priority: 0,
        number: k,
        wake: false,
        entering: true,
        blockedBy: [],
      })),
    );

    let cursor: string | undefined;
    const order: string[] = [];
    for (let tick = 0; tick < 3; tick++) {
      const r = pickNext(pool, [], caps, NOW, cursor);
      cursor = r.cursor;
      order.push(...r.picked.map((p) => p.project));
      const gone = new Set(r.picked.map((p) => p.id));
      pool = pool.filter((c) => !gone.has(c.id));
    }

    expect(order).toEqual(['a', 'b', 'c', 'a', 'b', 'c']);
  });
});
