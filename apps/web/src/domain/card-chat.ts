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
 * Exports: transcriptOf(), lineOf(), lineAuthor(), awaitingReply().
 * Depends on: schemas/cards (type), domain/board-columns (STATE_LABEL), domain/card-event-lines,
 *   domain/card-escalation-lines,
 *   domain/director-flow, domain/grill-answer-echo, types/cards-ui.types.
 */

import type { CardTypeName } from '@forge/core';
import { TicketStatus } from '@forge/core';
import { STATE_LABEL } from '#/domain/board-columns.js';
import { escalationLineOf, raisedIds } from '#/domain/card-escalation-lines.js';
import { flowLineOf } from '#/domain/card-event-lines.js';
import { grillOf } from '#/domain/director-flow.js';
import { echoedAnswerSeqs } from '#/domain/grill-answer-echo.js';
import type { CardHistoryEvent } from '#/schemas/cards.js';
import type {
  ChatAction,
  ChatLine,
  FlowLineContext,
  TicketEventKind,
} from '#/types/cards-ui.types.js';

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

/** A state in words when it is a known ticket state, else as sent. */
function stateWord(value: unknown): string {
  const parsed = TicketStatus.safeParse(value);

  return parsed.success ? STATE_LABEL[parsed.data] : (str(value) ?? 'another state');
}

/** One action the Director took, from an `ActionTaken` object (or, leniently, a string). */
function actionOf(action: unknown): ChatAction | undefined {
  if (typeof action === 'string') {
    const text = str(action);

    return text === undefined ? undefined : { text };
  }

  if (action !== null && typeof action === 'object') {
    const record = action as Record<string, unknown>;
    const text = str(record['summary']) ?? str(record['action']);
    const result = record['result'];

    return text === undefined
      ? undefined
      : { text, ...(result === 'done' || result === 'refused' ? { result } : {}) };
  }

  return undefined;
}

function actionsOf(payload: Record<string, unknown>): readonly ChatAction[] {
  const list = payload['actions_taken'];

  return Array.isArray(list)
    ? list.map(actionOf).filter((a): a is ChatAction => a !== undefined)
    : [];
}

const NO_FLOW: FlowLineContext = { grill: grillOf([]), canAnswer: false };

const humanKind = (kind: string): string => kind.replace(/_/g, ' ');

/** One history event as a transcript line. `typeLabel` names a card type in words. */
export function lineOf(
  event: CardHistoryEvent,
  typeLabel: (name: CardTypeName) => string = (name) => name,
  flow: FlowLineContext = NO_FLOW,
  raised: ReadonlySet<string> = new Set(),
): ChatLine {
  const { payload } = event;
  const base = {
    key: `e${event.seq}`,
    at: event.at,
    actions: [] as readonly ChatAction[],
  };

  const note = (text: string, ticketId?: string): ChatLine => ({
    ...base,
    tone: 'note',
    text,
    ...(ticketId === undefined ? {} : { ticketId }),
  });

  // The four ticket kinds can fold into a run (domain/chat-folds). The ticket's link is drawn
  // before the text, so with a ticket the text starts at the verb.
  const ticketNote = (
    kind: TicketEventKind,
    withLink: string,
    without: string,
    toState?: string,
  ): ChatLine => ({
    ...note(ticketId === undefined ? without : withLink, ticketId),
    fold: 'ticket',
    ticketEvent: kind,
    ...(toState === undefined ? {} : { toState }),
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
    case 'director_action': {
      const action = actionOf(payload);

      return {
        ...base,
        tone: 'note',
        text: action?.text ?? 'The Director took an action.',
        ...(action === undefined ? {} : { action }),
        ...(ticketId === undefined ? {} : { ticketId }),
      };
    }

    case 'close_suggested': {
      const reason = str(payload['reason']);

      return {
        ...base,
        tone: 'note',
        text: `The Director suggests closing this card${reason ? `: ${reason}` : '.'}`,
        ...(reason === undefined ? {} : { closeReason: reason }),
      };
    }

    case 'ticket_created': {
      const title = str(payload['title']) ?? 'untitled';

      return ticketNote('created', `created: ${title}`, `Ticket created: ${title}`);
    }

    case 'ticket_state': {
      const why = str(payload['reason']);
      const from = stateWord(payload['from']);
      const to = stateWord(payload['to']);
      const tail = `${to} (was ${from})${why ? `: ${why}` : ''}`;

      return ticketNote('moved', `is now ${tail}`, `A ticket is now ${tail}`, to);
    }

    case 'interaction_opened':
      return ticketNote(
        'asked',
        'asked a question that needs you',
        'A ticket asked a question that needs you',
      );
    case 'interaction_answered':
      return ticketNote(
        'answered',
        'had its question answered',
        'A ticket had its question answered',
      );
    case 'type_changed':
      return note(
        `Type changed from ${typeLabel(String(payload['from']))} to ${typeLabel(String(payload['to']))}`,
      );
    case 'card_closed':
      return note(`Card closed: ${str(payload['reason']) ?? 'no reason given'}`);
    case 'note':
      return note(str(payload['text']) ?? 'Note');
    default:
      // The planning flow's kinds have their own lines; anything else is newer than this UI:
      // say what we can, never crash.
      return (
        flowLineOf(event, flow) ??
        escalationLineOf(event, raised) ??
        note(str(payload['text']) ?? `Event: ${humanKind(event.kind)}`, ticketId)
      );
  }
}

/** Kinds the transcript leaves out: a running step shows as the "thinking" row. */
const NOT_IN_TRANSCRIPT: ReadonlySet<string> = new Set(['step_started']);

/**
 * The whole transcript, plus lines the server has not confirmed yet at the end.
 * `canAnswer` is false on a closed card or outside the grilling phase.
 */
export function transcriptOf(
  events: readonly CardHistoryEvent[],
  unsent: readonly { id: string; text: string; at: string }[],
  typeLabel?: (name: CardTypeName) => string,
  canAnswer = true,
): readonly ChatLine[] {
  const flow: FlowLineContext = { grill: grillOf(events), canAnswer };
  const raised = raisedIds(events);
  const echoed = echoedAnswerSeqs(events);

  return [
    ...events
      .filter((event) => !NOT_IN_TRANSCRIPT.has(event.kind))
      // A finished step the very next raise explains ("Approve the plan · Waiting for the
      // owner") would only say the dock's words twice.
      .filter(
        (event, index, all) =>
          !(event.kind === 'step_finished' && all[index + 1]?.kind === 'needs_you'),
      )
      // A typed answer is also a chat message; one owner bubble per answer.
      .filter((event) => !echoed.has(event.seq))
      // A settle whose block is already in the chat would only repeat it.
      .filter(
        (event) =>
          !(
            event.kind === 'escalation_settled' &&
            escalationLineOf(event, raised) === undefined
          ),
      )
      .map((event) => lineOf(event, typeLabel, flow, raised)),
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

/**
 * Who a line speaks for, for grouping: `owner` or `director` for speech and questions, null
 * for notes, steps and escalations (they are events, not turns, and never carry a header).
 */
export function lineAuthor(line: ChatLine): 'owner' | 'director' | null {
  if (line.block?.kind === 'escalation' || line.block?.kind === 'step') {
    return null;
  }

  return line.tone === 'you' ? 'owner' : line.tone === 'director' ? 'director' : null;
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
