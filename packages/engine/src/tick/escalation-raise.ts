/**
 * Raising an escalation: the one way the engine opens a wait on the owner.
 *
 * Why: every producer (a run that ended badly, a verify fault, a lane hold, an expired
 *   question) must leave the same trace: one pending interaction that carries what is wrong, the
 *   card to show it on, the stage it starts in, and a line in the card's history. Producers call
 *   this inside the transaction that parks the ticket, so a ticket can never wait without an
 *   interaction behind it (the invariant sweep reports one that does). A wait starts with the
 *   Director's first look (hidden from the owner) unless the cause is one only a person can fix
 *   or the owner turned the first look off; handing a wait to the owner is a compare-and-swap, so
 *   it can never overwrite an answer.
 *
 * Exports: raiseEscalation(), handToOwner(), logOpened(), attemptsOf(), directorFirst(), stageFor().
 * Depends on: @forge/core (escalation schemas, storage tx), domain/escalation-copy, shared/time,
 *   tick/card-log, tick/planning-state, types/engine. Writes inside the caller's transaction.
 */

import type {
  EscalationFailure,
  EscalationPayload,
  EscalationStage,
  Interaction,
  StorageTx,
  Ticket,
} from '@forge/core';
import { titleOf } from '#/domain/escalation-copy.js';
import { FAR_FUTURE } from '#/shared/time.js';
import { ENGINE_ACTOR, logCardEvent } from '#/tick/card-log.js';
import { directorFor } from '#/tick/planning-state.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { EngineDeps } from '#/types/engine.types.js';
import type { RaisedPayload } from '#/types/escalation.types.js';

const MAX_ATTEMPTS = 6;

/** Whether the Director looks first for this ticket's project (an owner setting, on by default). */
export async function directorFirst(
  ctx: EngineCtx,
  tx: StorageTx,
  ticket: Pick<Ticket, 'project'>,
): Promise<boolean> {
  const slug = (await tx.projects.get(ticket.project))?.slug ?? ticket.project;

  return directorFor(ctx, slug).director.escalation.director_first;
}

/** The stage a new failure starts in: the Director's look, unless a person alone can fix it or the owner turned the look off. */
export async function stageFor(
  ctx: EngineCtx,
  tx: StorageTx,
  ticket: Pick<Ticket, 'project'>,
  ownerOnly: boolean,
): Promise<EscalationStage> {
  return !ownerOnly && (await directorFirst(ctx, tx, ticket)) ? 'director' : 'owner';
}

/** What the ticket's runs did, newest last and capped, for a failure's `attempts`. */
export async function attemptsOf(
  tx: StorageTx,
  ticketId: string,
): Promise<EscalationFailure['attempts']> {
  const runs = await tx.runs.listByTicket(ticketId);

  return runs.slice(-MAX_ATTEMPTS).map((r) => ({
    at: r.ended_at ?? r.started_at,
    what: `run ${r.id} on ${r.harness}`,
    result: r.error_family ?? r.status,
  }));
}

/** Writes the `escalation` card event: the wait has reached the owner. */
export async function logOpened(
  tx: StorageTx,
  nowIso: string,
  row: Pick<Interaction, 'id' | 'ticket_id' | 'card_id'>,
  payload: EscalationPayload,
): Promise<void> {
  await logCardEvent(tx, row.card_id, {
    kind: 'escalation',
    at: nowIso,
    actor: ENGINE_ACTOR,
    payload: {
      interaction_id: row.id,
      ticket_id: row.ticket_id as Ticket['id'],
      escalation_kind: payload.kind,
      title: titleOf(payload),
    },
  });
}

/**
 * Opens a failure or setup escalation for `ticket` and returns its id. A ticket that already
 * has one pending keeps it (a second park of the same wait must not raise a second row). A row
 * that starts with the owner is stamped and announced on the card at once; failures and setups
 * never time out.
 */
export async function raiseEscalation(
  tx: StorageTx,
  deps: Pick<EngineDeps, 'ids'>,
  nowIso: string,
  ticket: Ticket,
  payload: RaisedPayload,
  stage: EscalationStage,
  runId?: string,
): Promise<string> {
  const open = (await tx.interactions.listByTicket(ticket.id)).find(
    (i) => i.status === 'pending' && (i.kind === 'failure' || i.kind === 'setup'),
  );

  if (open) {
    return open.id;
  }

  const row: Interaction = {
    id: deps.ids.interactionId(),
    ticket_id: ticket.id,
    ...(runId === undefined ? {} : { run_id: runId }),
    ...(ticket.card_id === undefined ? {} : { card_id: ticket.card_id }),
    kind: payload.kind,
    payload,
    status: 'pending',
    asked_at: nowIso,
    timeout_at: FAR_FUTURE,
    ...(stage === 'owner' ? { escalated_at: nowIso } : {}),
  };

  await tx.interactions.insert(row);
  await logCardEvent(tx, ticket.card_id, {
    kind: 'interaction_opened',
    at: nowIso,
    actor: ENGINE_ACTOR,
    payload: { ticket_id: ticket.id, interaction_id: row.id, interaction_kind: row.kind },
  });

  if (stage === 'owner') {
    await logOpened(tx, nowIso, row, payload);
  }

  return row.id;
}

/**
 * Hands a pending escalation from the Director's look to the owner with the (possibly
 * enriched) `payload`. False when it was already handed over or settled meanwhile.
 */
export async function handToOwner(
  tx: StorageTx,
  nowIso: string,
  row: Interaction,
  payload: EscalationPayload,
): Promise<boolean> {
  const won = await tx.interactions.escalate(
    row.id,
    { payload, escalated_at: nowIso },
    nowIso,
  );

  if (won) {
    await logOpened(tx, nowIso, row, payload);
  }

  return won;
}
