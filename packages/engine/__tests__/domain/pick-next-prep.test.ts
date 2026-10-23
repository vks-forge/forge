/**
 * Tests for a ticket whose worktree is being prepared: it already holds its Worker slot.
 *
 * Why: an install can take minutes. The ticket must not be started a second time while it runs, and
 *   the owner must read what it waits for ("Getting the workspace ready: Install packages (0:42)")
 *   instead of a ticket that looks stuck in Planned. Other tickets are not held back by it beyond the
 *   slot it occupies, which the schedule counts as a running Worker.
 *
 * Pins: a candidate with `prep` is never picked and gets the `prep` wait reason; the others are
 *   still picked; the wait reads in words with the elapsed time and the step.
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

describe('pickNext with a worktree being prepared', () => {
  it('does not pick it again, and says what it is doing', () => {
    const prep = { step: 'Install packages', elapsedMs: 42_000 };
    const result = pickNext([candidate(1, { prep }), candidate(2)], [], caps, 0);

    expect(result.picked.map((p) => p.id)).toEqual(['FG-2']);
    expect(result.waits.get('FG-1')).toEqual({ kind: 'prep', ...prep });
  });

  it('reads as the owner would say it', () => {
    expect(
      describeWait({ kind: 'prep', step: 'Install packages', elapsedMs: 42_000 }),
    ).toBe('Getting the workspace ready: Install packages (0:42)');

    expect(describeWait({ kind: 'prep', step: '', elapsedMs: 125_000 })).toBe(
      'Getting the workspace ready (2:05)',
    );
  });
});
