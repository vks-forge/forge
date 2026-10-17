/**
 * Card escalation lines: the chat lines for a ticket that waits on the owner.
 *
 * Why: a ticket's trouble is raised in the card's chat so the owner meets it where they already
 *   talk to the Director. An `escalation` event becomes a block the chat draws from the live
 *   escalation (so it shows "Answered by you" wherever it was answered, not what it looked like
 *   when it was raised); `escalation_settled` becomes one quiet line, left out when the block for
 *   the same item is already in the chat (it would only say the same thing twice) and kept when
 *   the Director settled it before the owner ever saw it; `replan_requested` is a quiet line with
 *   the owner's comment. A payload that does not parse falls back to a neutral line, never a crash.
 *
 * Exports: escalationLineOf(), ESCALATION_KINDS, raisedIds().
 * Depends on: schemas/card-events, schemas/cards (type), domain/escalation-copy, types/cards-ui.types.
 */

import { settledWords } from '#/domain/escalation-copy.js';
import {
  EscalationRaised,
  EscalationSettledEvent,
  ReplanRequested,
} from '#/schemas/card-events.js';
import type { CardHistoryEvent } from '#/schemas/cards.js';
import type { ChatLine } from '#/types/cards-ui.types.js';

/** Event kinds this module draws. */
export const ESCALATION_KINDS: ReadonlySet<string> = new Set([
  'escalation',
  'escalation_settled',
  'replan_requested',
]);

/** Interaction ids that already have their escalation block in this history. */
export function raisedIds(events: readonly CardHistoryEvent[]): ReadonlySet<string> {
  const ids = new Set<string>();

  for (const event of events) {
    const parsed =
      event.kind === 'escalation' ? EscalationRaised.safeParse(event.payload) : undefined;

    if (parsed?.success) {
      ids.add(parsed.data.interaction_id);
    }
  }

  return ids;
}

/** The line for one escalation event; undefined when the kind is not ours or the line is redundant. */
export function escalationLineOf(
  event: CardHistoryEvent,
  raised: ReadonlySet<string>,
): ChatLine | undefined {
  const base = { key: `e${event.seq}`, at: event.at, actions: [] };

  if (event.kind === 'escalation') {
    const parsed = EscalationRaised.safeParse(event.payload);

    return parsed.success
      ? {
          ...base,
          tone: 'note',
          text: parsed.data.title,
          ticketId: parsed.data.ticket_id,
          block: {
            kind: 'escalation',
            interactionId: parsed.data.interaction_id,
            ticketId: parsed.data.ticket_id,
            title: parsed.data.title,
          },
        }
      : { ...base, tone: 'note', text: 'A ticket needs you' };
  }

  if (event.kind === 'escalation_settled') {
    const parsed = EscalationSettledEvent.safeParse(event.payload);
    if (!parsed.success) {
      return { ...base, tone: 'note', text: 'A waiting ticket was settled' };
    }

    const { interaction_id: id, ticket_id: ticketId, action, by, note } = parsed.data;
    if (raised.has(id)) {
      return undefined;
    }

    return {
      ...base,
      tone: 'note',
      text: `${settledWords(action, by)}${note ? `: ${note}` : ''}`,
      ticketId,
    };
  }

  if (event.kind === 'replan_requested') {
    const parsed = ReplanRequested.safeParse(event.payload);
    const comment = parsed.success ? parsed.data.comment : '';

    return {
      ...base,
      tone: 'note',
      text:
        comment === ''
          ? 'You asked for a re-plan'
          : `You asked for a re-plan: ${comment}`,
      ...(parsed.success && parsed.data.ticket_id
        ? { ticketId: parsed.data.ticket_id }
        : {}),
    };
  }

  return undefined;
}
