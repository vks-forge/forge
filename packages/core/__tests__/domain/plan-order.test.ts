/**
 * Tests for plan ticket ordering.
 *
 * Why: approving a plan files tickets one by one, and a ticket can only wait on one that
 *   already exists. A wrong order would either refuse the approval or create a ticket whose
 *   blocker is missing, so the order must put dependencies first, keep the plan's own order
 *   otherwise and never lose a ticket.
 *
 * Pins: plan order kept when already valid, a dependent moved after its blocker, stability
 *   among independent tickets, and a property that every ticket follows its dependencies.
 * Depends on: src/domain/plan-order, tests/helpers/plan-fixtures, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { dependentsOf, orderPlanTickets } from '#/domain/plan-order.js';
import { ticket } from '#tests/helpers/plan-fixtures.js';

const keys = (ts: { key: string }[]): string[] => ts.map((t) => t.key);

describe('orderPlanTickets', () => {
  it('keeps an order that already respects the dependencies', () => {
    const ts = [ticket('t1'), ticket('t2', { depends_on: ['t1'] }), ticket('t3')];

    expect(keys(orderPlanTickets(ts))).toEqual(['t1', 't2', 't3']);
  });

  it('moves a ticket after the one it waits on and keeps ties in plan order', () => {
    const ts = [ticket('t1', { depends_on: ['t3'] }), ticket('t2'), ticket('t3')];

    expect(keys(orderPlanTickets(ts))).toEqual(['t2', 't3', 't1']);
  });

  it('puts every ticket after its dependencies for any acyclic plan', () => {
    fc.assert(
      fc.property(fc.array(fc.nat(3), { minLength: 1, maxLength: 8 }), (parents) => {
        // Ticket i may depend on any earlier ticket; the plan lists them reversed.
        const ts = parents.map((p, i) =>
          ticket(`t${i + 1}`, { depends_on: i === 0 ? [] : [`t${(p % i) + 1}`] }),
        );

        const ordered = orderPlanTickets([...ts].reverse());
        const seen = new Set<string>();
        for (const t of ordered) {
          expect(t.depends_on.every((d) => seen.has(d))).toBe(true);
          seen.add(t.key);
        }

        expect(ordered).toHaveLength(ts.length);
      }),
    );
  });
});

describe('dependentsOf', () => {
  it('lists the tickets that depend directly on a key', () => {
    const ts = [ticket('t1'), ticket('t2', { depends_on: ['t1'] }), ticket('t3')];

    expect(dependentsOf(ts, 't1')).toEqual(['t2']);
    expect(dependentsOf(ts, 't3')).toEqual([]);
  });
});
