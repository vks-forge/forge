/**
 * Plan order — the order a plan's tickets are created and run in.
 *
 * Why: approving a plan files its tickets, and a ticket can only wait on one that already
 *   exists, so the tickets are created dependencies first. The plan lists them in the order
 *   the Director (or the owner, by reordering) chose; this keeps that order wherever the
 *   dependencies allow and moves a ticket later only when it must come after what it waits
 *   on. Ties never reorder, so the same plan always files the same way.
 *
 * Exports: orderPlanTickets(), dependentsOf().
 * Depends on: schemas/plan. No IO.
 */

import type { PlanTicket } from '#/schemas/plan.js';

/** The tickets with every ticket after the ones it depends on; the plan's own order wins otherwise. */
export function orderPlanTickets(tickets: readonly PlanTicket[]): PlanTicket[] {
  const placed = new Set<string>();
  const out: PlanTicket[] = [];
  const left = [...tickets];
  while (left.length > 0) {
    const at = left.findIndex((t) => t.depends_on.every((d) => placed.has(d)));
    // A loop never reaches here (PlanTickets refuses it); a leftover is appended rather than lost.
    const [next] = left.splice(at === -1 ? 0 : at, 1);
    if (next) {
      placed.add(next.key);
      out.push(next);
    }
  }

  return out;
}

/** Keys of the tickets that depend directly on `key`. */
export function dependentsOf(tickets: readonly PlanTicket[], key: string): string[] {
  return tickets.filter((t) => t.depends_on.includes(key)).map((t) => t.key);
}
