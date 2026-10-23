/**
 * Card chat gate: the shared checks and history lines for every Director action.
 *
 * Why: each chat action ends the same way, as a `director_action` line when it ran or a plain
 *   `note` when it was refused, and starts with the same check that the card is open and its type
 *   and phase allow the kind (d-0141). Keeping that in one file lets the ticket-edit actions and the
 *   rest share it without a circular import, so a refusal reads the same whichever action raised it.
 *
 * Exports: CHAT_ACTOR, refuse(), done(), gate().
 * Depends on: @forge/core (chatActionRefusal, card schemas), tick/card-log, types/card-chat.
 *   Writes inside the caller's transaction.
 */

import { chatActionRefusal } from '@forge/core';
import type {
  ActionTaken,
  CardActor,
  CardId,
  ChatActionKind,
  StorageTx,
} from '@forge/core';
import { logCardEvent } from '#/tick/card-log.js';
import type { ActionGate } from '#/types/card-chat.types.js';

/** Who the card history names for what the card's Director did. */
export const CHAT_ACTOR: CardActor = { type: 'director', id: 'card-chat' };

export async function refuse(
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
    payload: { text: `The Director did not ${kind.replaceAll('_', ' ')}: ${why}.` },
  });

  return { action: kind, result: 'refused', summary: why };
}

export async function done(
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
export async function gate(
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
  const why = type
    ? chatActionRefusal(type, kind, card.phase)
    : `unknown card type ${card.type}`;

  if (!type || why !== null) {
    return {
      ok: false,
      taken: await refuse(tx, cardId, at, kind, why ?? 'the card type is unknown'),
    };
  }

  return { ok: true, card, type };
}
