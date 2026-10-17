/**
 * The owner's actions on a waiting ticket: `actOnEscalation` and `actOnTicket`.
 *
 * Why: every owner wait ends with one of a few actions (answer, retry, re-plan, cancel, run as
 *   Express, re-check a setup, send finished work back), and they must all behave the same way
 *   at the edges. The action must be one the escalation offers (a lane hold cannot be "retried",
 *   a question the Director is still looking at cannot be acted on); it must apply once (a
 *   second tab or a double click finds it settled); and it must not strand work (cancelling a
 *   ticket other tickets wait on is refused unless the owner asks to cancel the chain). Each
 *   action settles the interaction and changes the ticket or card through the doors in one
 *   transaction (tick/escalation-effects), so the card history and the ticket cannot disagree.
 *
 * Exports: actOnEscalation(), actOnTicket().
 * Depends on: @forge/core (escalation rules and schemas), tick/escalation-effects, tick/escalation-facts,
 *   tick/escalation-settle, tick/interactions, tick/plan-to-tickets, tick/ticket-cancel,
 *   tick/card-notify, tick/tick-requests, types/escalation. Writes storage.
 */

import {
  escalationActions,
  isSetupFixed,
  ticketWaitActions,
  toEscalation,
} from '@forge/core';
import type {
  EscalationActBody,
  Interaction,
  StorageTx,
  Ticket,
  TicketId,
} from '@forge/core';
import { resolveAnswer, stillBroken } from '#/domain/escalation-copy.js';
import { iso } from '#/shared/time.js';
import { notifyCard } from '#/tick/card-notify.js';
import { cancelFlow } from '#/tick/escalation-cancel.js';
import { replanTx, retryTx, reworkTx } from '#/tick/escalation-effects.js';
import { setupFactsFor } from '#/tick/escalation-facts.js';
import { answerQuestionTx } from '#/tick/interactions.js';
import { runAsExpress } from '#/tick/run-as-express.js';
import { requestTick } from '#/tick/tick-requests.js';
import type { EngineState } from '#/types/engine-state.types.js';
import type { EngineDeps } from '#/types/engine.types.js';
import type { ActOutcome, EffectEnd } from '#/types/escalation.types.js';

/** A card the Director can re-plan through: the ticket has one, and it is not a Discussion. */
async function replannable(tx: StorageTx, ticket: Ticket): Promise<boolean> {
  const card = ticket.card_id === undefined ? null : await tx.cards.get(ticket.card_id);

  return card !== null && card.type !== 'discussion' && card.closed_reason === undefined;
}

const NOT_FOUND: ActOutcome = { status: 'not_found' };

/** Maps how an effect ended onto the outcome the routes know. */
function ended(end: EffectEnd, interaction: Interaction | null): ActOutcome {
  return end === 'done'
    ? { status: 'done', interaction }
    : end === 'stale'
      ? { status: 'stale' }
      : { status: 'not_pending' };
}

/** Settles `row` (still pending) with the owner's `body`; the action was already checked against what is offered. */
async function apply(
  deps: EngineDeps,
  state: EngineState,
  row: Interaction,
  ticket: Ticket,
  body: EscalationActBody,
  author: string,
): Promise<ActOutcome> {
  const nowIso = iso(deps.clock.now());
  const view = toEscalation(row);
  const reload = (): Promise<Interaction | null> =>
    deps.storage.transaction((tx) => tx.interactions.get(row.id));

  switch (body.action) {
    case 'answer': {
      if (view.payload.kind !== 'question') {
        return { status: 'action_not_offered' };
      }

      const answer = resolveAnswer(view.payload, body);
      if (typeof answer === 'string') {
        return { status: 'invalid_answer', reason: answer };
      }

      const won = await deps.storage.transaction((tx) =>
        answerQuestionTx(deps, tx, row, answer, author),
      );

      return ended(won ? 'done' : 'not_pending', await reload());
    }

    case 'retry': {
      const end = await deps.storage.transaction((tx) =>
        retryTx(
          deps,
          tx,
          nowIso,
          row,
          { action: 'retry', by: 'owner', ...(body.note ? { note: body.note } : {}) },
          author,
        ),
      );

      return ended(end, await reload());
    }

    case 'recheck': {
      if (view.payload.kind !== 'setup') {
        return { status: 'action_not_offered' };
      }

      const cause = view.payload.cause;
      const fixed = await deps.storage.transaction(async (tx) => {
        const slug = (await tx.projects.get(ticket.project))?.slug ?? ticket.project;
        const settings = (await deps.config.project(slug)).config.project;

        return isSetupFixed(
          cause,
          await setupFactsFor(deps, tx, cause, settings),
          row.escalated_at ?? row.asked_at,
        );
      });

      if (!fixed) {
        return { status: 'still_broken', detail: stillBroken(cause) };
      }

      const end = await deps.storage.transaction((tx) =>
        retryTx(deps, tx, nowIso, row, { action: 'recheck', by: 'owner' }, author),
      );

      return ended(end, await reload());
    }

    case 'cancel':
      return cancelFlow(deps, state, ticket.id, row, body.cascade === true, author);
    case 'run_as_express': {
      const out = await runAsExpress(deps, state, ticket.id, author);

      return out.status === 'released'
        ? { status: 'done', interaction: await reload() }
        : { status: 'stale' };
    }

    case 'replan': {
      const end = await deps.storage.transaction((tx) =>
        replanTx(tx, nowIso, row, body.comment, author),
      );

      return ended(end, await reload());
    }

    case 'rework':
      return { status: 'action_not_offered' };
  }
}

/** Settles the escalation `id` with the owner's action, once. */
export async function actOnEscalation(
  deps: EngineDeps,
  state: EngineState,
  id: string,
  body: EscalationActBody,
  author: string,
): Promise<ActOutcome> {
  const found = await deps.storage.transaction(async (tx) => {
    const row = await tx.interactions.get(id);
    const ticket = row ? await tx.tickets.get(row.ticket_id as TicketId) : null;

    return row && ticket ? { row, ticket, replan: await replannable(tx, ticket) } : null;
  });

  if (!found) {
    return NOT_FOUND;
  }

  const { row, ticket, replan } = found;
  const view = toEscalation(row);
  if (row.status !== 'pending') {
    return { status: 'not_pending', ...(view.settled ? { settled: view.settled } : {}) };
  }

  const offered =
    view.stage === 'owner'
      ? escalationActions(view.payload, { replannable: replan })
      : [];

  if (!offered.includes(body.action)) {
    return { status: 'action_not_offered' };
  }

  const out = await apply(deps, state, row, ticket, body, author);
  if (out.status === 'done') {
    requestTick(deps, state);
    if (ticket.card_id) {
      await notifyCard(deps, ticket.card_id);
    }
  }

  return out;
}

/** The owner's action on a ticket's own wait: Rework on finished work, Cancel on anything open. */
export async function actOnTicket(
  deps: EngineDeps,
  state: EngineState,
  ticketId: string,
  body: EscalationActBody,
  author: string,
): Promise<ActOutcome> {
  const found = await deps.storage.transaction(async (tx) => {
    const ticket = await tx.tickets.get(ticketId as TicketId);

    return ticket ? { ticket, replan: await replannable(tx, ticket) } : null;
  });

  if (!found) {
    return NOT_FOUND;
  }

  const { ticket } = found;
  const offered = ticketWaitActions(
    { status: ticket.status, replannable: found.replan },
    [],
    'open',
  );

  // Only these two work without an escalation behind them; everything else goes through the interaction.
  if (
    (body.action !== 'rework' && body.action !== 'cancel') ||
    !offered.includes(body.action)
  ) {
    return { status: 'action_not_offered' };
  }

  if (body.action === 'cancel') {
    return cancelFlow(deps, state, ticketId, null, body.cascade === true, author);
  }

  if (body.action !== 'rework') {
    return { status: 'action_not_offered' };
  }

  const nowIso = iso(deps.clock.now());
  const reworked = await deps.storage.transaction((tx) =>
    reworkTx(deps, tx, nowIso, ticketId, body.comment),
  );

  if (!reworked) {
    return { status: 'stale' };
  }

  requestTick(deps, state);
  if (ticket.card_id) {
    await notifyCard(deps, ticket.card_id);
  }

  return { status: 'done', interaction: null };
}
