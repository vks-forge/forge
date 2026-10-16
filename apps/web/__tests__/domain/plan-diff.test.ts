/**
 * Pins: two plan versions are compared field by field with tickets matched by key (added,
 * removed, changed, and a reorder on its own); the server's recorded diff is shown as short
 * text; absent values are null.
 *
 * Why: the owner reviews a new version by what moved. A reorder that shows no row, a changed
 *   ticket shown as remove-and-add, or raw JSON in a row would each hide the one change that
 *   matters before approving.
 * Depends on: src/domain/plan-diff, src/schemas/plan. No IO.
 */

import { describe, expect, it } from 'vitest';
import { describeValue, diffPlans, diffRowsOf } from '#/domain/plan-diff.js';
import { PlanVersion } from '#/schemas/plan.js';

const plan = (over: Record<string, unknown> = {}) =>
  PlanVersion.parse({
    card_id: 'C',
    version: 1,
    created_at: 'now',
    goal: 'Goal',
    tickets: [
      { key: 't1', title: 'One' },
      { key: 't2', title: 'Two' },
    ],
    ...over,
  });

describe('diffPlans', () => {
  it('has no rows for equal plans', () => {
    expect(diffPlans(plan(), plan({ version: 2 }))).toEqual([]);
  });

  it('reports a changed field with both sides, and an added or emptied list', () => {
    const rows = diffPlans(plan(), plan({ goal: 'Better goal', assumptions: ['A'] }));

    expect(rows).toEqual([
      { field: 'Goal', before: 'Goal', after: 'Better goal' },
      { field: 'Assumptions', before: null, after: 'A' },
    ]);
  });

  it('matches tickets by key: added, removed and changed', () => {
    const next = plan({
      tickets: [
        { key: 't1', title: 'One, renamed' },
        { key: 't3', title: 'Three' },
      ],
    });

    const rows = diffPlans(plan(), next);

    expect(rows.map((r) => [r.field, r.before === null, r.after === null])).toEqual([
      ['Ticket t1', false, false],
      ['Ticket t3', true, false],
      ['Ticket t2', false, true],
    ]);
  });

  it('reports a reorder on its own', () => {
    const next = plan({
      tickets: [
        { key: 't2', title: 'Two' },
        { key: 't1', title: 'One' },
      ],
    });

    expect(diffPlans(plan(), next)).toEqual([
      { field: 'Ticket order', before: 't1, t2', after: 't2, t1' },
    ]);
  });
});

describe('describeValue and diffRowsOf', () => {
  it('writes values as short text', () => {
    expect(describeValue(undefined)).toBeNull();
    expect(describeValue(['a', 'b'])).toBe('a; b');
    expect(describeValue([])).toBe('(none)');
    expect(describeValue({ title: 'T' })).toBe('T');
    expect(describeValue(3)).toBe('3');
  });

  it('turns the recorded diff into rows', () => {
    expect(diffRowsOf([{ field: 'goal', before: 'a', after: 'b' }])).toEqual([
      { field: 'goal', before: 'a', after: 'b' },
    ]);
  });
});
