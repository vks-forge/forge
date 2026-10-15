/**
 * Card chat actions: what the Director asked for, run only through the existing doors.
 *
 * Why: the Director's reply is untrusted model output, so each action it names is checked
 *   and then executed by the same code a person's request would use, never by a new path:
 *   a ticket is filed with the intake inserter (numbered, `inbox`, linked, logged), a Worker
 *   is steered with `steerRun`, a retype follows the PATCH rule (`checkTypeChange`), and a
 *   close is only ever a suggestion (d-0112). The card type's registry decides which kinds
 *   are allowed (`chatActionRefusal`) and a card over its budget cap files nothing more. A
 *   refusal is a plain `note` on the card and never throws, so one bad action cannot sink the
 *   reply or the tick; an executed action writes `director_action` in the same transaction as
 *   its effect. Pause, stop and re-plan of tickets have no door yet and are not offered.
 *
 * Exports: runChatAction().
 * Depends on: @forge/core (card chat schemas and rules), tick/card-chat-context,
 *   tick/card-log, tick/steer-run, tick/ticket-insert. Reads and writes storage.
 */

import { chatActionRefusal, checkTypeChange } from '@forge/core';
import type {
  ActionTaken,
  Card,
  CardActor,
  CardChatAction,
  CardId,
  ChatActionKind,
  StorageTx,
  TicketId,
} from '@forge/core';
import { cardSpend } from '#/tick/card-chat-context.js';
import { logCardEvent } from '#/tick/card-log.js';
import { steerRun } from '#/tick/steer-run.js';
import { insertInboxTicket } from '#/tick/ticket-insert.js';
import type { ActionGate } from '#/types/card-chat.types.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** Who the card history names for what the card's Director did. */
export const CHAT_ACTOR: CardActor = { type: 'director', id: 'card-chat' };

async function refuse(
  tx: StorageTx,
  cardId: CardId,
  at: string,
  kind: ChatActionKind,
  why: string,
): Promise<ActionTaken> {
  await logCardEvent(tx, cardId, {
    kind: 'note',
    at,
    actor: CHAT_ACTOR,
    payload: { text: `The Director did not ${kind.replace('_', ' ')}: ${why}.` },
  });

  return { action: kind, result: 'refused', summary: why };
}

async function done(
  tx: StorageTx,
  cardId: CardId,
  at: string,
  kind: ChatActionKind,
  summary: string,
): Promise<ActionTaken> {
  const taken: ActionTaken = { action: kind, result: 'done', summary };
  await logCardEvent(tx, cardId, {
    kind: 'director_action',
    at,
    actor: CHAT_ACTOR,
    payload: taken,
  });

  return taken;
}

/** The card and its type if the card is open and its type allows `kind`; else the logged refusal. */
async function gate(
  tx: StorageTx,
  cardId: CardId,
  at: string,
  kind: ChatActionKind,
): Promise<ActionGate> {
  const card = await tx.cards.get(cardId);
  if (!card || card.closed_reason !== undefined) {
    return { ok: false, taken: await refuse(tx, cardId, at, kind, 'the card is closed') };
  }

  const type = await tx.cardTypes.get(card.type);
  const why = type ? chatActionRefusal(type, kind) : `unknown card type ${card.type}`;
  if (!type || why !== null) {
    return {
      ok: false,
      taken: await refuse(tx, cardId, at, kind, why ?? 'the card type is unknown'),
    };
  }

  return { ok: true, card, type };
}

async function createTicket(
  tx: StorageTx,
  card: Card,
  at: string,
  action: Extract<CardChatAction, { kind: 'create_ticket' }>,
): Promise<ActionTaken> {
  const tickets = await tx.tickets.listByCard(card.id);
  const spent = await cardSpend(tx, tickets);
  if (card.budget_cap_usd !== undefined && spent >= card.budget_cap_usd) {
    return refuse(
      tx,
      card.id,
      at,
      'create_ticket',
      `the card has spent $${spent.toFixed(2)} of its $${card.budget_cap_usd.toFixed(2)} budget cap`,
    );
  }

  const project = await tx.projects.get(card.project);
  if (!project) {
    return refuse(tx, card.id, at, 'create_ticket', `unknown project ${card.project}`);
  }

  const ticket = await insertInboxTicket(tx, project, {
    cardId: card.id,
    title: action.title,
    body: action.body,
    type: 'chore',
    ...(action.lane ? { lane: action.lane } : {}),
    at,
    actor: CHAT_ACTOR,
  });

  return done(tx, card.id, at, 'create_ticket', `filed ${ticket.id}: ${ticket.title}`);
}

async function changeType(
  tx: StorageTx,
  card: Card,
  at: string,
  to: string,
): Promise<ActionTaken> {
  if (to === card.type) {
    return refuse(tx, card.id, at, 'change_type', `the card is already a ${to}`);
  }

  const next = await tx.cardTypes.get(to);
  const check = checkTypeChange(card, next, to);
  if (!check.ok) {
    return refuse(tx, card.id, at, 'change_type', check.message);
  }

  await tx.cards.update(card.id, { type: to, updated_at: at });
  await logCardEvent(tx, card.id, {
    kind: 'type_changed',
    at,
    actor: CHAT_ACTOR,
    payload: { from: card.type, to },
  });

  return done(
    tx,
    card.id,
    at,
    'change_type',
    `changed the card type from ${card.type} to ${to}`,
  );
}

async function steerWorker(
  ctx: EngineCtx,
  cardId: CardId,
  action: Extract<CardChatAction, { kind: 'steer_run' }>,
): Promise<ActionTaken> {
  const { deps, state, nowIso } = ctx;
  const target = await deps.storage.transaction(async (tx) => {
    const g = await gate(tx, cardId, nowIso, 'steer_run');
    if (!g.ok) {
      return g.taken;
    }

    const ticket = await tx.tickets.get(action.ticket_id as TicketId);
    if (ticket?.card_id !== cardId) {
      return refuse(
        tx,
        cardId,
        nowIso,
        'steer_run',
        `${action.ticket_id} is not a ticket of this card`,
      );
    }

    return ticket.assignee_run_id ?? null;
  });

  if (typeof target === 'object' && target !== null) {
    return target;
  }

  const why = await (async (): Promise<string | null> => {
    if (target === null) {
      return `${action.ticket_id} has no Worker running`;
    }

    try {
      const out = await steerRun(deps, state, target, action.message, 'director');
      if (out.status === 'delivered') {
        return null;
      }

      return out.status === 'not_live'
        ? `the Worker of ${action.ticket_id} is not running`
        : `the Worker of ${action.ticket_id} cannot take a live message`;
    } catch (e) {
      return `delivery to ${action.ticket_id} failed (${e instanceof Error ? e.message : String(e)})`;
    }
  })();

  return deps.storage.transaction((tx) =>
    why === null
      ? done(
          tx,
          cardId,
          nowIso,
          'steer_run',
          `sent an instruction to the Worker of ${action.ticket_id}`,
        )
      : refuse(tx, cardId, nowIso, 'steer_run', why),
  );
}

/** Runs one action; the outcome is on the card's history already. Never throws for a refusal. */
export async function runChatAction(
  ctx: EngineCtx,
  cardId: CardId,
  action: CardChatAction,
): Promise<ActionTaken> {
  if (action.kind === 'steer_run') {
    return steerWorker(ctx, cardId, action);
  }

  const at = ctx.nowIso;

  return ctx.deps.storage.transaction(async (tx) => {
    const g = await gate(tx, cardId, at, action.kind);
    if (!g.ok) {
      return g.taken;
    }

    switch (action.kind) {
      case 'create_ticket':
        return createTicket(tx, g.card, at, action);
      case 'change_type':
        return changeType(tx, g.card, at, action.type);
      case 'suggest_close':
        await logCardEvent(tx, cardId, {
          kind: 'close_suggested',
          at,
          actor: CHAT_ACTOR,
          payload: { reason: action.reason },
        });

        return done(
          tx,
          cardId,
          at,
          'suggest_close',
          `suggested closing: ${action.reason}`,
        );
    }
  });
}
