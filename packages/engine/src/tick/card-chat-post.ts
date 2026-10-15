/**
 * Card chat intake: a user's message to the card's Director, and the Director's status.
 *
 * Why: the user talks to the Director of a card (d-0109), but the reply is a model call that
 *   must not hold the HTTP request open or run outside the tick. So the message is stored
 *   first as a `user_message` event (the history never loses what the user said), the card
 *   is queued for the next tick's `card_chat` step, and the request returns at once. A
 *   closed card takes no chat: a late message must not look answered. While the reply is
 *   queued or running the status is `thinking` so the Card page can show it; after a failed
 *   reply it is `error` until the user writes again. Both are process-local on purpose: they
 *   describe work in flight, and the history already holds everything that happened.
 *
 * Exports: postCardMessage(), cardDirectorStatus().
 * Depends on: @forge/core (CardId), tick/card-log, tick/tick-requests, shared/time.
 *   Writes storage.
 */

import { CardId } from '@forge/core';
import type { CardDirectorStatus } from '@forge/core';
import { iso } from '#/shared/time.js';
import { logCardEvent } from '#/tick/card-log.js';
import { requestTick } from '#/tick/tick-requests.js';
import type { EngineState } from '#/types/engine-state.types.js';
import type { EngineDeps, PostCardMessageResult } from '#/types/engine.types.js';

/** Stores `text` from `author` on the card and queues the Director's reply. */
export async function postCardMessage(
  deps: EngineDeps,
  state: EngineState,
  cardId: string,
  text: string,
  author: string,
): Promise<PostCardMessageResult> {
  const id = CardId.safeParse(cardId);
  if (!id.success) {
    return { status: 'not_found' };
  }

  const at = iso(deps.clock.now());
  const result = await deps.storage.transaction(
    async (tx): Promise<PostCardMessageResult> => {
      const card = await tx.cards.get(id.data);
      if (!card) {
        return { status: 'not_found' };
      }

      if (card.closed_reason !== undefined) {
        return { status: 'closed' };
      }

      const event = await logCardEvent(tx, card.id, {
        kind: 'user_message',
        at,
        actor: { type: 'user', id: author },
        payload: { text },
      });

      return event ? { status: 'stored', event } : { status: 'not_found' };
    },
  );

  if (result.status === 'stored') {
    state.chat.errors.delete(id.data);
    state.chat.pending.add(id.data);
    requestTick(deps, state);
  }

  return result;
}

/** `thinking` while a reply is queued or running, `error` after a failed one, else `idle`. */
export function cardDirectorStatus(
  state: EngineState,
  cardId: string,
): CardDirectorStatus {
  const { pending, busy, errors } = state.chat;
  if (pending.has(cardId) || busy.has(cardId)) {
    return { state: 'thinking' };
  }

  const lastError = errors.get(cardId);

  return lastError === undefined
    ? { state: 'idle' }
    : { state: 'error', last_error: lastError };
}
