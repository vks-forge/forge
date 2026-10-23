/**
 * Ticket wait schemas — the phase a ticket is really in and the line that says why.
 *
 * Why: a ticket's status is a coarse state-machine word. "In Progress" can mean a Worker is
 *   running, or that the owner just asked for rework and the only Worker slot is taken by
 *   another ticket; "Needs you" can mean an open question, or an answer already given while
 *   the card re-plans. The owner reads the board to decide where to look, so each ticket
 *   carries a phase and one plain line, with the tickets involved (who holds the slot, what
 *   blocks it) so the board can link to them. The server sends this on every ticket row.
 *
 * Exports: TicketPhase, SchedulerWaitKind, TicketWait.
 * Depends on: schemas/ids, zod. No IO.
 */

import { z } from 'zod';
import { CardId, TicketId } from '#/schemas/ids.js';

/** Where a ticket really is, as the board shows it. */
export const TicketPhase = z.enum([
  'queued',
  'setting_up',
  'waiting_slot',
  'waiting_deps',
  'held_by_plan',
  'paused_quota',
  'backing_off',
  'working',
  'checking',
  'waiting_you',
  'stuck',
  'done',
  'cancelled',
]);
export type TicketPhase = z.infer<typeof TicketPhase>;

/** The scheduler's reason a ticket has not started (its wait kinds, plus a backoff wake). */
export const SchedulerWaitKind = z.enum([
  'deps',
  'plan',
  'prep',
  'quota',
  'cap',
  'backoff',
]);
export type SchedulerWaitKind = z.infer<typeof SchedulerWaitKind>;

/** The phase, one plain line, and the tickets and card the line names. */
export const TicketWait = z.object({
  phase: TicketPhase,
  text: z.string().min(1),
  /** Tickets holding the Worker slot this ticket waits for. */
  holders: z.array(TicketId).optional(),
  /** Tickets this one waits on to finish. */
  blockers: z.array(TicketId).optional(),
  /** The card whose planning holds the ticket. */
  card_id: CardId.optional(),
  /** When the wait started or ends, when known (ISO). */
  since: z.iso.datetime().optional(),
});
export type TicketWait = z.infer<typeof TicketWait>;
