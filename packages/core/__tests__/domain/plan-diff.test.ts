/**
 * Tests for the plan diff.
 *
 * Why: after Request changes the owner reads the diff instead of the whole plan, so it must
 *   show every real change and nothing else. A missed change would let a revision slip in
 *   unseen; a phantom change (from key order in a database round trip) would train the owner
 *   to ignore the diff.
 *
 * Pins: no entries for equal plans, scalar and list fields, per-ticket added/removed/changed
 *   entries, reorder detection, and key-order independence.
 * Depends on: src/domain/plan-diff, tests/helpers/plan-fixtures, vitest.
 */

import { describe, expect, it } from 'vitest';
import { diffPlans } from '#/domain/plan-diff.js';
import { plan, ticket } from '#tests/helpers/plan-fixtures.js';

describe('diffPlans', () => {
  it('reports nothing for equal plans, whatever their key order', () => {
    const a = plan();
    const b = plan({ verification: { ...a.verification } });

    expect(diffPlans(a, { ...b, version: 2 })).toEqual([]);
  });

  it('reports a changed goal and a changed list with before and after', () => {
    const d = diffPlans(plan(), plan({ version: 2, goal: 'Ship it', scope: ['list'] }));

    expect(d.map((e) => e.field)).toEqual(['goal', 'scope']);
    expect(d[0]).toEqual({ field: 'goal', before: 'Ship a todo app', after: 'Ship it' });
  });

  it('reports an added, a removed and a changed ticket by key', () => {
    const prev = plan();
    const next = plan({
      version: 2,
      tickets: [ticket('t1', { title: 'Renamed' }), ticket('t3')],
    });

    const d = diffPlans(prev, next);

    expect(d.map((e) => e.field)).toEqual(['tickets.t1', 'tickets.t2', 'tickets.t3']);
    expect(d.find((e) => e.field === 'tickets.t2')?.after).toBeNull();
    expect(d.find((e) => e.field === 'tickets.t3')?.before).toBeNull();
  });

  it('reports a reorder of the tickets both versions share', () => {
    const prev = plan({ tickets: [ticket('t1'), ticket('t2')] });
    const next = plan({ version: 2, tickets: [ticket('t2'), ticket('t1')] });

    const d = diffPlans(prev, next);

    expect(d).toEqual([
      { field: 'tickets.order', before: ['t1', 't2'], after: ['t2', 't1'] },
    ]);
  });
});
