/**
 * The engine's one door for ticket writes: events through `transition()`, applied by CAS.
 *
 * Why: ticket status is the Director's source of truth, and the rule that no caller can
 *   skip a gate or sign-off only holds if every status change comes out of `transition()`
 *   (code.md rule 6). Every phase (triage, settle, dispatch, cancel) states what it wants
 *   as a plan of events plus plain fields, and this file reads the ticket, runs the events
 *   in order, and stores the result with a compare-and-swap on `status_version`, so a
 *   racing writer loses instead of overwriting. "Park for a human" is also here: it is a
 *   `parked` event, never a direct status write. A status change is also written to the
 *   ticket's card history in the same transaction, so the Card page's timeline follows the
 *   one door rather than a second hook, and the card's own phase follows its tickets through
 *   `syncCardWithTickets` (the card starts and completes with its work). A ticket that stops
 *   waiting on a person also closes any wait still pending, so no interaction outlives the
 *   state it described.
 *
 * Exports: moveTicketTx(), moveTicket(), parkPlan().
 * Depends on: @forge/core (transition, toTicketPatch), tick/card-log, tick/card-phase, tick/escalation-settle,
 *   types/tick. No IO of its own.
 */

import { toTicketPatch, transition } from '@forge/core';
import type {
  StorageAdapter,
  StorageTx,
  Ticket,
  TicketEvent,
  TicketId,
} from '@forge/core';
import { ENGINE_ACTOR, logCardEvent } from '#/tick/card-log.js';
import { syncCardWithTickets } from '#/tick/card-phase.js';
import { cancelLeftovers } from '#/tick/escalation-settle.js';
import type { EventSpec, MoveResult, TicketPlan } from '#/types/tick.types.js';

/** Statuses where a ticket waits on a person, and so on an interaction. */
const WAITING: readonly Ticket['status'][] = ['waiting_human', 'blocked'];

/** Applies `plan(ticket)` inside an open transaction; `null` from the planner means "nothing to do". */
export async function moveTicketTx(
  tx: StorageTx,
  id: string,
  nowIso: string,
  plan: (ticket: Ticket) => TicketPlan | null,
): Promise<MoveResult> {
  const current = await tx.tickets.get(id as TicketId);
  if (!current) {
    return { ok: false, reason: `unknown ticket ${id}` };
  }

  const p = plan(current);
  if (!p) {
    return { ok: false, reason: `${id}: nothing to do from ${current.status}` };
  }

  let next: Ticket = current;
  for (const spec of p.events) {
    const r = transition(next, { ...spec, at: nowIso } as TicketEvent);
    if (!r.ok) {
      return { ok: false, reason: `${id}: ${JSON.stringify(r.error)}` };
    }

    next = r.value;
  }

  next = { ...next, ...p.fields, updated_at: nowIso };
  const stored = await tx.tickets.updateTicketCas(
    current.id,
    current.status_version,
    toTicketPatch(next),
  );

  if (!stored) {
    return { ok: false, reason: `${id}: stale status_version` };
  }

  if (next.status !== current.status) {
    await logCardEvent(tx, current.card_id, {
      kind: 'ticket_state',
      at: nowIso,
      actor: ENGINE_ACTOR,
      payload: {
        ticket_id: current.id,
        from: current.status,
        to: next.status,
        ...(next.blocked_reason === undefined ? {} : { reason: next.blocked_reason }),
      },
    });

    await syncCardWithTickets(tx, current.card_id, nowIso);

    // A ticket that stops waiting by any door (cancelled, released) must not leave its wait
    // pending: the owner would be asked about something that no longer exists.
    if (WAITING.includes(current.status) && !WAITING.includes(next.status)) {
      await cancelLeftovers(tx, nowIso, current.id, `the ticket moved to ${next.status}`);
    }
  }

  return { ok: true, ticket: { ...next, status_version: current.status_version + 1 } };
}

/** {@link moveTicketTx} in its own transaction. */
export function moveTicket(
  storage: StorageAdapter,
  id: string,
  nowIso: string,
  plan: (ticket: Ticket) => TicketPlan | null,
): Promise<MoveResult> {
  return storage.transaction((tx) => moveTicketTx(tx, id, nowIso, plan));
}

/**
 * Events that end in WaitingHuman with `reason` as its visible blocker, from wherever the
 * ticket is: one `parked` event, so history never claims a dispatch or a question that did
 * not happen. Null for statuses with no such path.
 */
export function parkPlan(ticket: Ticket, reason: string): TicketPlan | null {
  const parked: EventSpec[] = [{ type: 'parked', reason }];
  switch (ticket.status) {
    case 'planned':
    case 'in_progress':
      return { events: parked };
    case 'waiting_human':
      return { events: [], fields: { blocked_reason: reason } };
    default:
      return null;
  }
}
