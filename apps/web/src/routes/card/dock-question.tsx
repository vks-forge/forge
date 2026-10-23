/**
 * DockQuestion: the Director's open grill question, answerable from the needs-you dock.
 *
 * Why: the grill is how the owner steers a card before any code is written, and it must cost one
 *   click per question and stay in reach while the chat grows. The question sits directly over
 *   the message box with a primary "Use recommended" button (one tap takes the Director's pick)
 *   and its two to four options (the recommendation badged, never pre-selected),
 *   "Why it matters" on demand, and the two ways out of the interview: take the recommendations
 *   for everything left, or stop asking and write the plan. Free text has no second box: typing
 *   in the message box answers the open question, and the line under the options says so. When
 *   the question itself is not in the loaded history (an older page of events), the dock still
 *   shows what the server says is open, as text, and the box still answers it.
 *
 * Exports: DockQuestion.
 * Depends on: react, lucide-react, components/ui/button, schemas/card-events (type),
 *   types/cards-ui.types.
 */

import { ChevronDown, Sparkles } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '#/components/ui/button.js';
import type { GrillQuestion } from '#/schemas/card-events.js';
import type { FlowHandlers } from '#/types/cards-ui.types.js';

export function DockQuestion(props: {
  question: GrillQuestion | null;
  /** What the server says is open, when the question is not in the loaded history. */
  fallback: readonly string[];
  flow: FlowHandlers;
}) {
  const { question, flow } = props;
  const [why, setWhy] = useState(false);
  const whyId = useId();

  if (question === null) {
    return (
      <div className="grid gap-1.5 text-sm">
        {props.fallback.map((text) => (
          <p key={text} className="min-w-0 break-words font-medium">
            {text}
          </p>
        ))}
        <p className="text-xs text-muted">Type your answer in the box below.</p>
      </div>
    );
  }

  const open = question.open_points;
  const recommended = question.options.find((option) => option.recommended);

  return (
    <div className="grid gap-2">
      <p className="min-w-0 break-words text-sm font-medium">{question.text}</p>
      {question.why ? (
        <div className="grid gap-1">
          <button
            type="button"
            aria-expanded={why}
            aria-controls={whyId}
            onClick={() => setWhy((value) => !value)}
            className="inline-flex min-h-8 items-center gap-1 justify-self-start rounded-md text-xs font-medium text-signal hover:underline"
          >
            Why it matters
            <ChevronDown
              aria-hidden="true"
              className={`size-3.5 transition-transform duration-150 ${why ? 'rotate-180' : ''}`}
            />
          </button>
          {why ? (
            <p id={whyId} className="min-w-0 break-words text-xs text-muted">
              {question.why}
            </p>
          ) : null}
        </div>
      ) : null}

      {recommended ? (
        <Button
          variant="primary"
          className="h-auto w-full whitespace-normal! py-2 text-left"
          disabled={flow.busy}
          onClick={() =>
            flow.onAnswer(question.question_id, { optionId: recommended.id })
          }
        >
          <Sparkles aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 break-words">
            Use recommended: {recommended.label}
          </span>
        </Button>
      ) : null}

      <ul aria-label="Answers" className="flex flex-wrap gap-2">
        {question.options.map((option) => (
          <li key={option.id} className="max-w-full">
            <button
              type="button"
              data-dock-option=""
              disabled={flow.busy}
              onClick={() => flow.onAnswer(question.question_id, { optionId: option.id })}
              className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-lg border border-line bg-bg px-3 py-1 text-left text-sm font-medium transition-[background-color,border-color] duration-150 hover:border-signal hover:bg-signal-soft disabled:cursor-not-allowed disabled:opacity-50"
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
      </ul>

      <p className="text-xs text-muted">
        {question.allow_other ? 'Or type your own answer in the box below.' : null}
        {open > 0
          ? `${question.allow_other ? ' ' : ''}${open} open point${open === 1 ? '' : 's'}.`
          : null}
      </p>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Button
          className="h-auto whitespace-normal! py-1.5 text-left"
          disabled={flow.busy}
          onClick={() => flow.onShortcut('use_recommendations')}
        >
          Use your recommendations for the rest
        </Button>
        <Button
          className="h-auto whitespace-normal! py-1.5 text-left"
          disabled={flow.busy}
          onClick={() => flow.onShortcut('write_plan_now')}
        >
          Enough, write the plan
        </Button>
      </div>
    </div>
  );
}
