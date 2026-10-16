/**
 * Director flow: what a card's planning events say about the conversation right now.
 *
 * Why: the card chat has to answer three live questions without asking the server again: which
 *   grill question is open (only the newest unanswered one may be answered; answering an old
 *   one is refused with `question_not_open`), is a Director step running (the "thinking"
 *   indicator and its label come from a `step_started` with no `step_finished`), and is the
 *   card waiting on the owner (the pinned banner comes from the newest `needs_you` that nothing
 *   has settled since). All of it is derived from the history so the chat and the Plan tab
 *   agree and a reload shows the same state. Payloads are untrusted, so each is parsed and an
 *   unreadable one is skipped, never thrown on.
 *
 * Exports: grillOf(), pendingStep(), activeNeedsYou().
 * Depends on: schemas/card-events, schemas/cards (type), types/cards-ui.types. No IO.
 */

import {
  GrillAnswer,
  GrillQuestion,
  NeedsYou,
  StepFinished,
  StepStarted,
} from '#/schemas/card-events.js';
import type { CardHistoryEvent } from '#/schemas/cards.js';
import type { GrillView } from '#/types/cards-ui.types.js';

/** Events that settle a raised `needs_you`: the owner or the Director moved the card on. */
const SETTLES_NEEDS_YOU: ReadonlySet<string> = new Set([
  'grill_answer',
  'grill_done',
  'plan_approved',
  'plan_changes_requested',
  'step_started',
  'card_closed',
]);

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

/** The newest `needs_you` raise that nothing after it has settled, or null. */
export function activeNeedsYou(events: readonly CardHistoryEvent[]): NeedsYou | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event === undefined) {
      continue;
    }

    if (event.kind === 'needs_you') {
      const parsed = NeedsYou.safeParse(event.payload);

      return parsed.success ? parsed.data : null;
    }

    if (SETTLES_NEEDS_YOU.has(event.kind)) {
      return null;
    }
  }

  return null;
}
