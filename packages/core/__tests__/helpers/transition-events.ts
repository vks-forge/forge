/**
 * Canned ticket events and an `apply()` that folds them through `transition()`.
 *
 * Why: the state-machine suites (paths, parking, properties) all walk a ticket through the
 * same named events at the same instant. One copy keeps them agreeing on what a "tier B
 * gate pass" is, and `apply()` turns an unexpected rejection into a loud failure instead
 * of a silently unchanged ticket.
 *
 * Exports: T1, apply(), ev.
 * Depends on: src/domain/state-machine, src/schemas/ticket, src/types/ticket-events.
 *   No IO.
 */

import { transition } from '#/domain/state-machine.js';
import type { TicketEvent } from '#/types/ticket-events.types.js';
import { type Ticket } from '#/schemas/ticket.js';

export const T1 = '2026-10-13T01:00:00.000Z';

export function apply(ticket: Ticket, ...events: TicketEvent[]): Ticket {
  let cur = ticket;
  for (const e of events) {
    const r = transition(cur, e);
    if (!r.ok) {
      throw new Error(`unexpected ${JSON.stringify(r.error)}`);
    }

    cur = r.value;
  }

  return cur;
}

export const ev = {
  triaged: { type: 'triaged', at: T1, lane: 'standard', tier_predicted: 'B' },
  dispatched: { type: 'dispatched', at: T1 },
  verifying: { type: 'verifying', at: T1 },
  gate_failed: { type: 'gate_failed', at: T1 },
  passA: { type: 'gate_passed', at: T1, tier_actual: 'A' },
  passB: { type: 'gate_passed', at: T1, tier_actual: 'B' },
  passC: { type: 'gate_passed', at: T1, tier_actual: 'C' },
  merged: { type: 'merged', at: T1 },
  cancelled: { type: 'cancelled', at: T1 },
} as const satisfies Record<string, TicketEvent>;
