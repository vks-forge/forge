/**
 * Tests for the slot a ticket wins when its worktree setup has just finished.
 *
 * Why: an install can take over a minute. When two retried tickets wait and one of them already
 *   finished its setup, the lower ticket number used to win the slot and run its own install while
 *   the prepared ticket's finished work sat idle (CHE-6 vs CHE-2, 2026-10-22). A finished setup
 *   must outrank every other candidate, retries included, while the fairness rules still hold inside
 *   each rank.
 *
 * Pins: prepared beats an equally woken lower-numbered ticket with one slot; prepared beats a
 *   higher-priority wake; with no prepared candidate the old order (wake before new, number) holds;
 *   two prepared candidates keep number order.
 * Depends on: src/domain/pick-next, vitest.
 */

import { describe, expect, it } from 'vitest';
import { pickNext } from '#/domain/pick-next.js';
import type { PickCandidate, PickCaps } from '#/types/pick-next.types.js';

const caps = (global: number): PickCaps => ({
  global,
  perProject: { default: 4, byProject: {} },
  perHarness: { default: 4, byId: {} },
  inProgress: { used: 0, limit: 10 },
  paused: {},
});

const candidate = (n: number, over: Partial<PickCandidate> = {}): PickCandidate => ({
  id: `CHE-${n}`,
  project: 'che',
  harness: 'claude-code',
  priority: 0,
  number: n,
  wake: true,
  entering: true,
  blockedBy: [],
  ...over,
});

const ids = (picked: readonly PickCandidate[]): string[] => picked.map((p) => p.id);

describe('pickNext: a finished setup starts first', () => {
  it('gives the only slot to the prepared ticket although another retried ticket has a lower number', () => {
    const result = pickNext(
      [candidate(2), candidate(6, { prepared: true })],
      [],
      caps(1),
      0,
    );

    expect(ids(result.picked)).toEqual(['CHE-6']);
    expect(result.waits.get('CHE-2')).toMatchObject({ kind: 'cap', scope: 'global' });
  });

  it('puts it ahead of a wake of higher priority', () => {
    const result = pickNext(
      [candidate(2, { priority: 5 }), candidate(6, { prepared: true })],
      [],
      caps(1),
      0,
    );

    expect(ids(result.picked)).toEqual(['CHE-6']);
  });

  it('keeps wake-before-new and number order when nothing is prepared', () => {
    const result = pickNext(
      [candidate(9, { wake: false }), candidate(6), candidate(2)],
      [],
      caps(3),
      0,
    );

    expect(ids(result.picked)).toEqual(['CHE-2', 'CHE-6', 'CHE-9']);
  });

  it('orders two prepared tickets by number', () => {
    const result = pickNext(
      [candidate(8, { prepared: true }), candidate(6, { prepared: true }), candidate(1)],
      [],
      caps(3),
      0,
    );

    expect(ids(result.picked)).toEqual(['CHE-6', 'CHE-8', 'CHE-1']);
  });
});
