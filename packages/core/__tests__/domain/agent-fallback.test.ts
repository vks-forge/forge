/**
 * Pins the order in which a stage falls back through its agent's list of places to run.
 *
 * Why: when the first model is rate-limited or gone, the run should move to the next entry the owner
 *   listed (d-0080), in the owner's order, never to one already tried, never to a harness that is parked or
 *   not installed, and a critic must not land on the Worker's own model family once two families are
 *   connected (d-0073). The choice is plain code so a loop over a list that keeps failing always ends, and so
 *   the same inputs always pick the same entry.
 *
 * Pins: the chain order with harnesses resolved, the next entry taken in the owner's order (same harness allowed), null
 *   when exhausted, parked and uninstalled harnesses skipped, the family guard, and the properties.
 * Depends on: src/domain/agent-fallback, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fallbackChain, nextFallback } from '#/domain/agent-fallback.js';
import type { RunsOn } from '#/schemas/agent.js';

const resolve = (ref: string): string =>
  ref === 'project_default' ? 'claude-code' : ref;

const runsOn: RunsOn = {
  harness: 'project_default',
  model: { kind: 'model', id: 'opus' },
  fallbacks: [
    { harness: 'project_default', model: { kind: 'model', id: 'sonnet' } },
    { harness: 'codex', model: { kind: 'model', id: 'gpt-5' } },
    { harness: 'opencode', model: { kind: 'harness_default' } },
  ],
};

const chain = fallbackChain(runsOn, resolve);
const everything = { paused: {}, installed: () => true, now: 1000 };

describe('fallbackChain', () => {
  it('lists the primary at slot 0 and the fallbacks in order, harnesses resolved', () => {
    expect(chain.map((c) => [c.slot, c.harness])).toEqual([
      [0, 'claude-code'],
      [1, 'claude-code'],
      [2, 'codex'],
      [3, 'opencode'],
    ]);

    expect(chain[1]?.model).toEqual({ kind: 'model', id: 'sonnet' });
  });

  it('a list with no fallbacks is just the primary', () => {
    expect(fallbackChain({ ...runsOn, fallbacks: [] }, resolve)).toHaveLength(1);
  });
});

describe('nextFallback', () => {
  it('takes the next entry, even on the same harness', () => {
    expect(nextFallback({ chain, tried: [0], ...everything })).toBe(1);
    expect(nextFallback({ chain, tried: [0, 1], ...everything })).toBe(2);
  });

  it('is null when every entry was tried', () => {
    expect(nextFallback({ chain, tried: [0, 1, 2, 3], ...everything })).toBeNull();
    expect(
      nextFallback({ chain: chain.slice(0, 1), tried: [0], ...everything }),
    ).toBeNull();
  });

  it('skips a parked harness until its pause ends, and a harness that is not installed', () => {
    const paused = { codex: { until: 5000 } };

    expect(
      nextFallback({ chain, tried: [0, 1], paused, installed: () => true, now: 1000 }),
    ).toBe(3);

    expect(
      nextFallback({ chain, tried: [0, 1], paused, installed: () => true, now: 6000 }),
    ).toBe(2);

    expect(
      nextFallback({
        chain,
        tried: [0, 1],
        paused: {},
        installed: (h) => h !== 'codex',
        now: 1,
      }),
    ).toBe(3);
  });

  it('keeps a critic off the Worker family only through the guard', () => {
    const noOpenai = (c: { model: { kind: string; id?: string } }): boolean =>
      c.model.kind !== 'model' || c.model.id !== 'gpt-5';

    expect(
      nextFallback({ chain, tried: [0, 1], ...everything, familyGuard: noOpenai }),
    ).toBe(3);

    expect(
      nextFallback({ chain, tried: [0, 1, 3], ...everything, familyGuard: noOpenai }),
    ).toBeNull();
  });

  it('never returns a tried slot or a parked harness, keeps order, and ends when exhausted', () => {
    const harnesses = ['claude-code', 'codex', 'opencode'];
    const entry = fc.record({
      harness: fc.constantFrom(...harnesses),
      model: fc.constantFrom(
        { kind: 'harness_default' as const },
        { kind: 'model' as const, id: 'opus' },
        { kind: 'model' as const, id: 'gpt-5' },
      ),
    });

    fc.assert(
      fc.property(
        fc.array(entry, { minLength: 0, maxLength: 5 }),
        fc.subarray([0, 1, 2, 3, 4, 5]),
        fc.subarray(harnesses),
        fc.subarray(harnesses),
        (fallbacks, triedAll, parked, missing) => {
          const c = fallbackChain(
            { harness: 'claude-code', model: { kind: 'forge_default' }, fallbacks },
            resolve,
          );

          const tried = triedAll.filter((s) => s < c.length);
          const paused = Object.fromEntries(parked.map((h) => [h, { until: 10 }]));
          const installed = (h: string): boolean => !missing.includes(h);
          const pick = nextFallback({ chain: c, tried, paused, installed, now: 5 });

          if (pick === null) {
            // Exhausted means every entry is tried, parked or missing.
            for (const e of c) {
              expect(
                tried.includes(e.slot) ||
                  parked.includes(e.harness) ||
                  missing.includes(e.harness),
              ).toBe(true);
            }

            return;
          }

          const chosen = c[pick];
          expect(tried).not.toContain(pick);
          expect(parked).not.toContain(chosen?.harness);
          expect(missing).not.toContain(chosen?.harness);
          // Order kept: no earlier usable, untried entry was passed over.
          for (const e of c.slice(0, pick)) {
            expect(
              tried.includes(e.slot) ||
                parked.includes(e.harness) ||
                missing.includes(e.harness),
            ).toBe(true);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('walking the chain visits each usable slot once and then stops', () => {
    const seen: number[] = [];
    let tried = [0];
    for (let i = 0; i < 10; i++) {
      const n = nextFallback({ chain, tried, ...everything });
      if (n === null) {
        break;
      }

      seen.push(n);
      tried = [...tried, n];
    }

    expect(seen).toEqual([1, 2, 3]);
  });
});
