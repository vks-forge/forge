/**
 * Card event lines: the chat lines for the events of the Director's planning flow.
 *
 * Why: the grill, the plan and the Director's steps are the heart of the card-first flow, and
 *   each reads differently in the chat: a question is a block with answer buttons until it is
 *   answered and then collapses to the words that were chosen; an answer is the owner's own
 *   bubble (labelled when the Director's recommendation was used on their behalf); a finished
 *   step is one quiet line that can expand to the files it read; a finished research run is one
 *   line saying what it looked up (or why it could not) with a way to the evidence; a ready plan is a card with a
 *   Review button; approvals, change requests, budget warnings and the end of the grill are
 *   plain system lines. A payload that does not parse falls back to a neutral line built from
 *   what can be read, never a crash and never a blank.
 *
 * Exports: flowLineOf(), FLOW_KINDS, answerWords().
 * Depends on: schemas/card-events, schemas/cards (type), domain/research-copy, types/cards-ui.types. No IO.
 */

import {
  GrillAnswer,
  GrillDone,
  GrillQuestion,
  PlanApproved,
  PlanChangesRequested,
  PlanReady,
  StepFinished,
} from '#/schemas/card-events.js';
import { researchLineOf } from '#/domain/research-copy.js';
import type { CardHistoryEvent } from '#/schemas/cards.js';
import type { ChatLine, FlowLineContext } from '#/types/cards-ui.types.js';

/** Event kinds this module draws. `needs_you` and `step_started` are drawn elsewhere. */
export const FLOW_KINDS: ReadonlySet<string> = new Set([
  'grill_question',
  'grill_answer',
  'grill_done',
  'step_finished',
  'plan_ready',
  'plan_approved',
  'plan_changes_requested',
  'budget_warning',
  'research',
]);

const DONE_WORDS: Readonly<Record<string, string>> = {
  nothing_open: 'Nothing is left to ask.',
  owner_enough: 'Enough questions.',
  use_recommendations: 'Using the recommendations for the rest.',
  zero_question: 'No questions were needed.',
};

/** The owner's answer in words: the option's label, or the free text, or a plain fallback. */
export function answerWords(
  answer: GrillAnswer,
  question: GrillQuestion | undefined,
): string {
  const label = question?.options.find((o) => o.id === answer.option_id)?.label;

  return label ?? answer.text?.trim() ?? 'Answered';
}

const money = (value: unknown): string =>
  typeof value === 'number' && Number.isFinite(value) ? `$${value.toFixed(2)}` : '?';

/** One flow event as a line, or null when the kind is not one of `FLOW_KINDS`. */
export function flowLineOf(
  event: CardHistoryEvent,
  context: FlowLineContext,
): ChatLine | null {
  const base = { key: `e${event.seq}`, at: event.at, actions: [] as ChatLine['actions'] };
  const note = (text: string): ChatLine => ({ ...base, tone: 'note', text });
  const { payload } = event;

  switch (event.kind) {
    case 'grill_question': {
      const parsed = GrillQuestion.safeParse(payload);
      if (!parsed.success) {
        return note('The Director asked a question I could not read.');
      }

      const answer = context.grill.answers.get(parsed.data.question_id);

      return {
        ...base,
        tone: 'director',
        text: parsed.data.text,
        block: {
          kind: 'question',
          question: parsed.data,
          answered: answer ? answerWords(answer, parsed.data) : null,
          actionable:
            context.canAnswer &&
            context.grill.question?.question_id === parsed.data.question_id,
        },
      };
    }

    case 'grill_answer': {
      const parsed = GrillAnswer.safeParse(payload);
      if (!parsed.success) {
        return note('An answer was recorded.');
      }

      return {
        ...base,
        tone: 'you',
        text: answerWords(
          parsed.data,
          context.grill.questions.get(parsed.data.question_id),
        ),
        ...(parsed.data.by === 'recommendation' ? { byRecommendation: true } : {}),
      };
    }

    case 'grill_done': {
      const parsed = GrillDone.safeParse(payload);
      const done = parsed.success ? parsed.data : { reason: '', assumptions: [] };
      const count = done.assumptions.length;

      return note(
        `${DONE_WORDS[done.reason] ?? 'The Director has what it needs.'} Writing the plan${
          count > 0 ? `, with ${count} assumption${count === 1 ? '' : 's'} noted` : ''
        }.`,
      );
    }

    case 'step_finished': {
      const parsed = StepFinished.safeParse(payload);
      if (!parsed.success) {
        return note('The Director finished a step.');
      }

      return {
        ...base,
        tone: 'note',
        text: parsed.data.label,
        block: {
          kind: 'step',
          label: parsed.data.label,
          summary: parsed.data.summary,
          files: parsed.data.files_read,
        },
      };
    }

    case 'plan_ready': {
      const parsed = PlanReady.safeParse(payload);
      if (!parsed.success) {
        return note('A plan is ready.');
      }

      const { version, ticket_count: count } = parsed.data;

      return {
        ...base,
        tone: 'director',
        text: `Plan v${version} is ready.`,
        block: {
          kind: 'plan_ready',
          version,
          ticketCount: count,
          autoApprove: parsed.data.auto_approve_eligible,
        },
      };
    }

    case 'plan_approved': {
      const parsed = PlanApproved.safeParse(payload);
      if (!parsed.success) {
        return note('The plan was approved.');
      }

      const by = parsed.data.by === 'director' ? 'the Director' : 'you';
      const count = parsed.data.ticket_ids.length;

      return note(
        `Plan v${parsed.data.version} approved by ${by}${
          count > 0 ? `: ${count} ticket${count === 1 ? '' : 's'} created` : ''
        }.`,
      );
    }

    case 'plan_changes_requested': {
      const parsed = PlanChangesRequested.safeParse(payload);

      return note(
        parsed.success
          ? `Changes requested on plan v${parsed.data.version}${
              parsed.data.comment.trim() === '' ? '' : `: ${parsed.data.comment}`
            }`
          : 'Changes were requested on the plan.',
      );
    }

    case 'research': {
      const research = researchLineOf(payload);

      return {
        ...base,
        tone: 'note',
        text: research.text,
        block: { kind: 'research', research },
      };
    }

    case 'budget_warning': {
      const pct = typeof payload['threshold'] === 'number' ? payload['threshold'] : null;

      return note(
        `Budget: ${money(payload['spent_usd'])} of ${money(payload['cap_usd'])} spent${
          pct === null ? '' : ` (${Math.round(pct <= 1 ? pct * 100 : pct)}% of the cap)`
        }. Work continues.`,
      );
    }

    default:
      return null;
  }
}
