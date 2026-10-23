/**
 * Director flow: what a card's planning events say about the conversation right now.
 *
 * Why: the card chat has to answer two live questions without asking the server again: which
 *   grill question is open (only the newest unanswered one may be answered; answering an old
 *   one is refused with `question_not_open`; the dock draws its options) and is a Director
 *   step running (the "thinking" indicator and its label come from a `step_started` with no
 *   `step_finished`). Both are derived from the history so the chat and the Plan tab agree and
 *   a reload shows the same state. What waits on the owner is no longer read from the history:
 *   the server sends it as `needs_you_detail` on the card (d-0172). Payloads are untrusted, so
 *   each is parsed and an unreadable one is skipped, never thrown on.
 *
 *   A step ends with an `outcome` the server writes: finished, paused for the owner (a budget
 *   question) or failed; a step that paused for the owner is never "thinking", and while anything
 *   waits on the owner a step with no end yet is not shown as thinking either.
 *
 * Exports: grillOf(), pendingStep(), lastStepOutcome(), isThinking(), canAnswerGrill().
 * Depends on: schemas/card-events, schemas/cards (type), types/cards-ui.types. No IO.
 */

import {
  GrillAnswer,
  GrillQuestion,
  StepFinished,
  StepStarted,
} from '#/schemas/card-events.js';
import type { CardHistoryEvent, CardPhase } from '#/schemas/cards.js';
import type { GrillView } from '#/types/cards-ui.types.js';

/** The grill as the history tells it: answers by question, and the newest question still open. */
export function grillOf(events: readonly CardHistoryEvent[]): GrillView {
  const answers = new Map<string, GrillAnswer>();
  const questions = new Map<string, GrillQuestion>();
  let question: GrillQuestion | null = null;

  for (const event of events) {
    if (event.kind === 'grill_question') {
      const parsed = GrillQuestion.safeParse(event.payload);
      question = parsed.success ? parsed.data : question;
      if (parsed.success) {
        questions.set(parsed.data.question_id, parsed.data);
      }
    } else if (event.kind === 'grill_answer') {
      const parsed = GrillAnswer.safeParse(event.payload);
      if (parsed.success) {
        answers.set(parsed.data.question_id, parsed.data);
      }
    } else if (event.kind === 'grill_done') {
      question = null;
    }
  }

  const open = question !== null && !answers.has(question.question_id) ? question : null;

  return {
    question: open,
    questions,
    answers,
    openPoints: open ? open.open_points : null,
  };
}

/** The newest Director step that has started and not finished, or null. */
export function pendingStep(events: readonly CardHistoryEvent[]): StepStarted | null {
  const finished = new Set<string>();
  for (const event of events) {
    if (event.kind === 'step_finished') {
      const parsed = StepFinished.safeParse(event.payload);
      if (parsed.success) {
        finished.add(parsed.data.step_id);
      }
    }
  }

  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.kind === 'step_started') {
      const parsed = StepStarted.safeParse(event.payload);
      if (parsed.success && !finished.has(parsed.data.step_id)) {
        return parsed.data;
      }
    }
  }

  return null;
}

/** How the newest finished step ended, when no step has started after it; null while one runs or before any. */
export function lastStepOutcome(
  events: readonly CardHistoryEvent[],
): StepFinished['outcome'] | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];

    if (event?.kind === 'step_started') {
      return null;
    }

    if (event?.kind === 'step_finished') {
      const parsed = StepFinished.safeParse(event.payload);

      return parsed.success ? parsed.data.outcome : null;
    }
  }

  return null;
}

/**
 * Whether to say "The Director is thinking". The server's own status comes first (a chat reply it is
 * working on is real); a step the history shows as started but not finished counts only while nothing
 * waits on the owner, because a Director that stopped to ask the owner is not thinking.
 */
export function isThinking(input: {
  serverState: 'idle' | 'thinking' | 'error';
  stepRunning: boolean;
  waitingOnOwner: boolean;
}): boolean {
  if (input.serverState === 'thinking') {
    return true;
  }

  return input.stepRunning && !input.waitingOnOwner;
}

/**
 * Whether the server would take an answer to the open question: only while the card is
 * grilling or verifying, and only on an open card (`isShaping`). A card from a server that sends
 * no phase is treated as answerable.
 */
export function canAnswerGrill(card: {
  phase?: CardPhase | undefined;
  closed_reason?: string | undefined;
}): boolean {
  return (
    card.closed_reason === undefined &&
    (card.phase === undefined || card.phase === 'grilling' || card.phase === 'verifying')
  );
}
