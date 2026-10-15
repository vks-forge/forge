/**
 * Card chat: turns a card's history events into the lines of the chat transcript.
 *
 * Why: a card's history mixes what people and the Director said with what happened (a ticket
 *   was created, moved, asked a question; the type changed; the card closed). The chat shows
 *   speech as bubbles and everything else as one compact line, so a long conversation stays
 *   readable. The card Director keeps adding event kinds, so any kind this UI does not know
 *   becomes a neutral note built from its text, never a crash and never a blank. Payloads are
 *   untrusted, so each field is read defensively. Pure and synchronous: every event kind is
 *   testable without a browser.
 *
 * Exports: transcriptOf(), lineOf(), awaitingReply().
 * Depends on: schemas/cards (type), domain/board-columns (STATE_LABEL), types/cards-ui.types.
 */

import type { CardTypeName } from '@forge/core';
import { TicketStatus } from '@forge/core';
import { STATE_LABEL } from '#/domain/board-columns.js';
import type { CardHistoryEvent } from '#/schemas/cards.js';
import type { ChatLine } from '#/types/cards-ui.types.js';

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

/** A state in words when it is a known ticket state, else as sent. */
function stateWord(value: unknown): string {
  const parsed = TicketStatus.safeParse(value);

  return parsed.success ? STATE_LABEL[parsed.data] : (str(value) ?? 'another state');
}

/** One action the Director took, as a short phrase, from a string or an object. */
function actionLabel(action: unknown): string | undefined {
  if (typeof action === 'string') {
    return str(action);
  }

  if (action !== null && typeof action === 'object') {
    const record = action as Record<string, unknown>;

    return (
      str(record['summary']) ??
      str(record['description']) ??
      str(record['text']) ??
      str(record['action']) ??
      str(record['name']) ??
      str(record['kind'])
    );
  }

  return undefined;
}

function actionsOf(payload: Record<string, unknown>): readonly string[] {
  const list = payload['actions_taken'];

  return Array.isArray(list)
    ? list.map(actionLabel).filter((a): a is string => a !== undefined)
    : [];
}

const humanKind = (kind: string): string => kind.replace(/_/g, ' ');

/** One history event as a transcript line. `typeLabel` names a card type in words. */
export function lineOf(
  event: CardHistoryEvent,
  typeLabel: (name: CardTypeName) => string = (name) => name,
): ChatLine {
  const { payload } = event;
  const base = { key: `e${event.seq}`, at: event.at, actions: [] as readonly string[] };
  const note = (text: string, ticketId?: string): ChatLine => ({
    ...base,
    tone: 'note',
    text,
    ...(ticketId === undefined ? {} : { ticketId }),
  });

  const ticketId = str(payload['ticket_id']);

  switch (event.kind) {
    case 'user_message':
      return { ...base, tone: 'you', text: str(payload['text']) ?? '(empty message)' };
    case 'director_message':
      return {
        ...base,
        tone: 'director',
        text: str(payload['text']) ?? '(empty message)',
        actions: actionsOf(payload),
      };
    case 'director_action':
      return note(
        str(payload['summary']) ??
          str(payload['text']) ??
          actionLabel(payload['action']) ??
          'The Director took an action.',
        ticketId,
      );
    case 'ticket_created':
      return note(`Ticket created: ${str(payload['title']) ?? 'untitled'}`, ticketId);
    case 'ticket_state': {
      const why = str(payload['reason']);

      return note(
        `moved from ${stateWord(payload['from'])} to ${stateWord(payload['to'])}${why ? ` (${why})` : ''}`,
        ticketId,
      );
    }

    case 'interaction_opened':
      return note('asked a question that needs you', ticketId);
    case 'interaction_answered':
      return note('had its question answered', ticketId);
    case 'type_changed':
      return note(
        `Type changed from ${typeLabel(String(payload['from']))} to ${typeLabel(String(payload['to']))}`,
      );
    case 'card_closed':
      return note(`Card closed: ${str(payload['reason']) ?? 'no reason given'}`);
    case 'note':
      return note(str(payload['text']) ?? 'Note');
    default:
      // An event kind newer than this UI: say what we can, never crash.
      return note(str(payload['text']) ?? `Event: ${humanKind(event.kind)}`, ticketId);
  }
}

/** The whole transcript, plus lines the server has not confirmed yet at the end. */
export function transcriptOf(
  events: readonly CardHistoryEvent[],
  unsent: readonly { id: string; text: string; at: string }[],
  typeLabel?: (name: CardTypeName) => string,
): readonly ChatLine[] {
  return [
    ...events.map((event) => lineOf(event, typeLabel)),
    ...unsent.map((message): ChatLine => ({
      key: `u${message.id}`,
      at: message.at,
      tone: 'you',
      text: message.text,
      actions: [],
      pending: true,
    })),
  ];
}

/** True while the newest message is the user's and the Director has not answered after it. */
export function awaitingReply(events: readonly CardHistoryEvent[]): boolean {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const kind = events[i]?.kind;
    if (kind === 'director_message') {
      return false;
    }

    if (kind === 'user_message') {
      return true;
    }
  }

  return false;
}
