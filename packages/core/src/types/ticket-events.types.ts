/**
 * Ticket events, transition errors and the internal state delta.
 *
 * Why: `transition()` is the single door for ticket status (code.md rule 6, director-core.md §3-§4); its input events and rejection reasons are part of its contract and are shared with the engine, HTTP API and gates.
 *
 * Exports: TicketEvent, TransitionError, TicketDelta.
 * Depends on: schemas/ticket. No IO (types only).
 */

import type { Lane, Ticket, TicketStatus, Tier } from '#/schemas/ticket.js';

/** Fields shared by every event. */
interface EventBase {
  readonly at: string;
  // CAS: the status_version the caller read (director-core.md §3).
  readonly expected_version?: number;
}

/** Every event that can move a ticket; each carries `at` (keeps `transition` pure) and an optional CAS `expected_version`. */
export type TicketEvent =
  | (EventBase & { type: 'triaged'; lane: Lane; tier_predicted: Tier })
  | (EventBase & { type: 'dispatched' })
  | (EventBase & { type: 'blocked'; reason: string })
  | (EventBase & { type: 'unblocked' })
  | (EventBase & { type: 'asked' })
  | (EventBase & { type: 'answered' })
  | (EventBase & { type: 'verifying' })
  | (EventBase & { type: 'gate_failed' })
  | (EventBase & { type: 'gate_passed'; tier_actual: Tier })
  | (EventBase & { type: 'merged' })
  | (EventBase & { type: 'done'; signer?: string })
  | (EventBase & { type: 'cancelled' })
  | (EventBase & { type: 'rework' });

/** Why an event was rejected: terminal ticket, illegal move, stale CAS version, or unmet precondition. */
export type TransitionError =
  | { kind: 'terminal'; status: TicketStatus; event: TicketEvent['type'] }
  | { kind: 'illegal_transition'; status: TicketStatus; event: TicketEvent['type'] }
  | { kind: 'stale_version'; expected: number; actual: number }
  | { kind: 'precondition'; event: TicketEvent['type']; message: string };

/** Fields an accepted event changes on a ticket; `status` is always set. */
export type TicketDelta = Pick<Ticket, 'status'> & Partial<Omit<Ticket, 'status'>>;
