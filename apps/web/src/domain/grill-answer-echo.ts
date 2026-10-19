/**
 * Grill answer echo: finds the typed answers the history records twice.
 *
 * Why: an owner who types into the chat box while a grill question is open sends a normal chat
 *   message. The engine stores it as a `user_message` (the reply queue points at it) and then
 *   takes it as the question's free-text answer, appending a `grill_answer` with the same words.
 *   Both are true history, but drawn as they are the owner sees their own sentence twice. The
 *   chat keeps the message where it was said and leaves out the answer that only repeats it.
 *   An option pick has no message, so its `grill_answer` is never an echo and is always drawn.
 *
 * Exports: echoedAnswerSeqs().
 * Depends on: schemas/card-events, schemas/cards (type). No IO.
 */

import { GrillAnswer } from '#/schemas/card-events.js';
import type { CardHistoryEvent } from '#/schemas/cards.js';

const words = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/**
 * Seqs of the `grill_answer` events that repeat the owner's immediately preceding chat message.
 * The message must be the newest `user_message` before the answer, with no question or other
 * answer between them, and carry the same words; anything else is a separate answer.
 */
export function echoedAnswerSeqs(
  events: readonly CardHistoryEvent[],
): ReadonlySet<number> {
  const echoed = new Set<number>();
  let message: string | null = null;

  for (const event of events) {
    if (event.kind === 'user_message') {
      message = words(event.payload['text']);
    } else if (event.kind === 'grill_question') {
      message = null;
    } else if (event.kind === 'grill_answer') {
      const parsed = GrillAnswer.safeParse(event.payload);
      const text = parsed.success ? words(parsed.data.text) : null;
      if (
        message !== null &&
        text === message &&
        parsed.success &&
        parsed.data.by === 'owner'
      ) {
        echoed.add(event.seq);
      }

      message = null;
    }
  }

  return echoed;
}
