/**
 * QuestionBlock: one grill question from the Director, with the ways to answer it.
 *
 * Why: the grill is how the owner steers a card before any code is written, and it must cost one
 *   click per question. The open question shows its text, why it matters, two to four options
 *   (the Director's recommendation badged, never pre-selected), "Other…" for free text, and the
 *   two ways out of the interview: take the recommendations for everything left, or stop asking
 *   and write the plan. Only the newest open question is actionable: an answered question
 *   collapses to its words (the owner's answer is its own bubble below), and one that was
 *   superseded says it got no answer instead of offering buttons the server would refuse
 *   (`question_not_open`). A refusal is shown right here in words. Every control is a real
 *   button, reachable by keyboard, 36 px or taller.
 *
 * Exports: QuestionBlock, FIRST_OPTION_ID.
 * Depends on: react, lucide-react, components/ui/button, components/ui/field,
 *   types/cards-ui.types, schemas/card-events (type).
 */

import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '#/components/ui/button.js';
import { INPUT_CLASS } from '#/components/ui/field.js';
import type { GrillQuestion } from '#/schemas/card-events.js';
import type { FlowHandlers } from '#/types/cards-ui.types.js';

/** DOM id of the first option, so the Needs you banner can move focus to the question. */
export const FIRST_OPTION_ID = 'grill-first-option';

export function QuestionBlock(props: {
  question: GrillQuestion;
  answered: string | null;
  actionable: boolean;
  flow: FlowHandlers;
}) {
  const { question, flow } = props;
  const [other, setOther] = useState(false);
  const [text, setText] = useState('');

  if (!props.actionable) {
    return (
      <div className="grid max-w-[88%] gap-0.5 border-l-2 border-line pl-3 text-sm">
        <p className="text-xs font-medium text-muted">
          {props.answered !== null ? 'Question, answered' : 'Question, not answered'}
        </p>
        <p className="min-w-0 break-words text-muted">{question.text}</p>
      </div>
    );
  }

  const open = question.open_points;

  return (
    <section
      aria-label="Question from the Director"
      className="grid max-w-[92%] gap-3 rounded-2xl border border-line bg-surface p-3 shadow-[0_1px_2px_oklch(25%_0.03_255/0.06)]"
    >
      <div className="grid gap-1">
        <p className="min-w-0 break-words text-sm font-medium">{question.text}</p>
        {question.why ? (
          <p className="min-w-0 break-words text-xs text-muted">{question.why}</p>
        ) : null}
      </div>

      <ul aria-label="Answers" className="flex flex-wrap gap-2">
        {question.options.map((option, index) => (
          <li key={option.id}>
            <button
              type="button"
              id={index === 0 ? FIRST_OPTION_ID : undefined}
              disabled={flow.busy}
              onClick={() => flow.onAnswer(question.question_id, { optionId: option.id })}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-line bg-bg px-3 text-left text-sm font-medium transition-[background-color,border-color] duration-150 hover:border-signal hover:bg-signal-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="min-w-0 break-words">{option.label}</span>
              {option.recommended ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-signal-soft px-1.5 py-0.5 text-xs font-medium text-signal">
                  <Sparkles aria-hidden="true" className="size-3" />
                  Recommended
                </span>
              ) : null}
            </button>
          </li>
        ))}
        {question.allow_other ? (
          <li>
            <button
              type="button"
              aria-expanded={other}
              disabled={flow.busy}
              onClick={() => setOther((value) => !value)}
              className="inline-flex min-h-9 items-center rounded-lg border border-dashed border-line px-3 text-sm text-muted transition-colors duration-150 hover:border-faint hover:text-fg disabled:opacity-50"
            >
              Other…
            </button>
          </li>
        ) : null}
      </ul>

      {other ? (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (text.trim() !== '') {
              flow.onAnswer(question.question_id, { text: text.trim() });
            }
          }}
        >
          <label
            htmlFor={`other-${question.question_id}`}
            className="text-xs font-medium"
          >
            Your answer
          </label>
          <textarea
            id={`other-${question.question_id}`}
            rows={2}
            value={text}
            onChange={(event) => setText(event.target.value)}
            className={INPUT_CLASS}
          />
          <div>
            <Button
              type="submit"
              variant="primary"
              disabled={text.trim() === '' || flow.busy}
            >
              Send answer
            </Button>
          </div>
        </form>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-2">
        <Button
          disabled={flow.busy}
          onClick={() => flow.onShortcut('use_recommendations')}
        >
          Use your recommendations for the rest
        </Button>
        <Button disabled={flow.busy} onClick={() => flow.onShortcut('write_plan_now')}>
          Enough, write the plan
        </Button>
        {open > 0 ? (
          <span className="ml-auto text-xs text-muted">
            {open} open point{open === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>

      {flow.error !== null ? (
        <p role="alert" className="rounded-lg bg-danger-soft p-2 text-sm">
          {flow.error}
        </p>
      ) : null}
    </section>
  );
}
