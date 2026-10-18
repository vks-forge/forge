/**
 * Pins how the scheduler places the members of a parallel group.
 *
 * Why: the members of a writer group or a check group are separate Workers, so each must be placed
 *   against the Worker limits on its own: two slots start both at once, one slot starts them one
 *   after the other (a reviewer and a critic are two Workers, not one), and the order in which the
 *   pipeline names them is the order they start in. The In Progress limit counts the ticket once,
 *   however many members it has. The candidate key tells the members apart.
 *
 * Pins: candidateKey(); two members of one ticket both picked with a per-project limit of two and
 *   only the first with a limit of one (the second waits on the project cap); members keep their
 *   given order; a ticket already in progress is not counted again for its members.
 * Depends on: src/domain/pick-next, vitest.
 */

import { describe, expect, it } from 'vitest';
import { candidateKey, pickNext } from '#/domain/pick-next.js';
import type { PickCandidate, PickCaps } from '#/types/pick-next.types.js';

const member = (
  id: string,
  m: string,
  over: Partial<PickCandidate> = {},
): PickCandidate => ({
  id,
  member: m,
  project: 'p',
  harness: 'claude',
  priority: 0,
  number: Number(id.split('-')[1]),
  wake: true,
  entering: false,
  blockedBy: [],
  ...over,
});

const caps = (perProject: number, inProgress = { used: 1, limit: 1 }): PickCaps => ({
  global: 4,
  perProject: { default: perProject, byProject: {} },
  perHarness: { default: 4, byId: {} },
  inProgress,
  paused: {},
});

describe('candidateKey', () => {
  it('is the ticket id for a lone stage and ticket#member for a member', () => {
    expect(candidateKey('FG-1')).toBe('FG-1');
    expect(candidateKey('FG-1', '')).toBe('FG-1');
    expect(candidateKey('FG-1', 'critique')).toBe('FG-1#critique');
  });
});

describe('members of one ticket', () => {
  const both = [member('FG-1', 'review'), member('FG-1', 'critique')];

  it('starts both under a per-project limit of two, in the pipeline order', () => {
    const { picked } = pickNext(both, [], caps(2), 0);

    expect(picked.map((p) => p.member)).toEqual(['review', 'critique']);
  });

  it('starts only the first under a limit of one, and says the second waits on the project cap', () => {
    const { picked, waits } = pickNext(both, [], caps(1), 0);

    expect(picked.map((p) => p.member)).toEqual(['review']);
    expect(waits.get('FG-1')).toMatchObject({ kind: 'cap', scope: 'project' });
  });

  it('starts the second once the first runs no longer occupy the slot', () => {
    const { picked } = pickNext([both[1] as PickCandidate], [], caps(1), 0);

    expect(picked.map((p) => p.member)).toEqual(['critique']);
  });

  it('counts a ticket already in progress once, however many members it has', () => {
    const { picked } = pickNext(both, [], caps(2, { used: 3, limit: 3 }), 0);

    expect(picked).toHaveLength(2);
  });
});
