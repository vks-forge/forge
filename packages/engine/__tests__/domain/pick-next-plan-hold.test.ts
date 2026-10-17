/**
 * Tests for holding back the not-started tickets of a card that is being re-planned.
 *
 * Why: when the owner sends a card back to the Director ("Re-plan"), the new plan may replace
 *   the tickets that have not started. Starting one of them meanwhile would spend a Worker run on
 *   work the new plan is about to cancel. Running tickets continue (they are not in this
 *   decision at all); only candidates whose card is back in shaping wait, and they wait without
 *   using up a project's turn, like a ticket with unfinished blockers.
 *
 * Pins: a candidate flagged `awaitsPlan` is never picked and gets the `plan` wait reason, others
 *   from the same project are still picked, and the wait reads in words on the ticket page.
 * Depends on: src/domain/pick-next, src/domain/wait-reason, vitest.
 */

import { describe, expect, it } from 'vitest';
import { pickNext } from '#/domain/pick-next.js';
import { describeWait } from '#/domain/wait-reason.js';
import type { PickCandidate, PickCaps } from '#/types/pick-next.types.js';

const caps: PickCaps = {
  global: 4,
  perProject: { default: 4, byProject: {} },
  perHarness: { default: 4, byId: {} },
  inProgress: { used: 0, limit: 10 },
  paused: {},
};

const candidate = (n: number, over: Partial<PickCandidate> = {}): PickCandidate => ({
  id: `FG-${n}`,
  project: 'forge',
  harness: 'claude-code',
  priority: 0,
  number: n,
  wake: false,
  entering: true,
  blockedBy: [],
  ...over,
});

describe('pickNext with a card being re-planned', () => {
  it('does not pick a candidate that awaits its card plan, and says why', () => {
    const result = pickNext([candidate(1, { awaitsPlan: true })], [], caps, 0);

    expect(result.picked).toEqual([]);
    expect(result.waits.get('FG-1')).toEqual({ kind: 'plan' });
  });

  it('still picks the others', () => {
    const result = pickNext(
      [candidate(1, { awaitsPlan: true }), candidate(2)],
      [],
      caps,
      0,
    );

    expect(result.picked.map((p) => p.id)).toEqual(['FG-2']);
  });

  it('holds a committed (wake) candidate too: its card is being re-planned as well', () => {
    const result = pickNext(
      [candidate(1, { awaitsPlan: true, wake: true })],
      [],
      caps,
      0,
    );

    expect(result.picked).toEqual([]);
  });

  it('words the wait for the ticket page', () => {
    expect(describeWait({ kind: 'plan' })).toBe('plan: the card is being re-planned');
  });
});
