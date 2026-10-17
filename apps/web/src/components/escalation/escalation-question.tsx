/**
 * EscalationQuestion: a Worker's question with every quick way to answer it.
 *
 * Why: a Worker that asked is parked until the owner answers, so answering must cost as little as
 *   the question allows. The Director may already have looked and left help: a suggested answer
 *   (one click sends it, and its words are shown right above the button so it is a choice, not a
 *   guess), up to four options with the Director's pick badged "Recommended" (never preselected),
 *   and a note on why it asked the owner. Free text is always available, kept in a draft that
 *   survives a refusal or a reload, and Ctrl or Cmd + Enter sends it. Only the answer path is here;
 *   Cancel comes from the shared action bar.
 *
 * Exports: EscalationQuestion.
 * Depends on: lucide-react, components/ui/button, components/ui/field, state/answer-draft,
 *   types/escalation-ui.types.
 */

import { Sparkles } from 'lucide-react';
import { Button } from '#/components/ui/button.js';
import { INPUT_CLASS } from '#/components/ui/field.js';
import { useAnswerDraft } from '#/state/answer-draft.js';
import type { EscalationControls, QuestionPayload } from '#/types/escalation-ui.types.js';

export function EscalationQuestion(props: {
  id: string;
  question: QuestionPayload;
  controls: EscalationControls;
}) {
  const { question, controls } = props;
  const { draft, setDraft, clearDraft } = useAnswerDraft(props.id);
  const fieldId = `escalation-answer-${props.id}`;
  const busy = controls.pending !== null;
  const send = (): void => {
    if (draft.trim() !== '' && !busy) {
      controls.act({ action: 'answer', text: draft.trim() }, clearDraft);
    }
  };

  return (
    <div className="grid gap-3">
      <p className="min-w-0 whitespace-pre-wrap break-words text-base">{question.text}</p>
      {question.director_note ? (
        <p className="min-w-0 break-words text-sm text-muted">
          The Director: {question.director_note}
        </p>
      ) : null}

      {question.suggested_answer ? (
        <div className="grid gap-2 rounded-xl border border-line bg-surface p-3">
          <p className="text-xs font-medium text-muted">Suggested by the Director</p>
          <p className="min-w-0 whitespace-pre-wrap break-words text-sm">
            {question.suggested_answer}
          </p>
          <div>
            <Button
              variant="primary"
              disabled={busy}
              status={controls.pending === 'answer' ? 'loading' : 'idle'}
              onClick={() =>
                controls.act({
                  action: 'answer',
                  text: question.suggested_answer ?? '',
                })
              }
            >
              Use suggested
            </Button>
          </div>
        </div>
      ) : null}

      {question.options.length > 0 ? (
        <ul aria-label="Answers" className="flex flex-wrap gap-2">
          {question.options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => controls.act({ action: 'answer', option_id: option.id })}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-left text-sm font-medium transition-[background-color,border-color] duration-150 hover:border-signal hover:bg-signal-soft disabled:cursor-not-allowed disabled:opacity-50"
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
      ) : null}

      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <label htmlFor={fieldId} className="text-sm font-medium">
          Your answer
        </label>
        <textarea
          id={fieldId}
          rows={3}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              send();
            }
          }}
          className={`${INPUT_CLASS} resize-y`}
        />
        <p className="text-xs text-muted">
          Sent once; the run resumes with it. Ctrl+Enter sends.
        </p>
        <div>
          <Button
            type="submit"
            variant={question.suggested_answer ? 'quiet' : 'primary'}
            disabled={draft.trim() === '' || (busy && controls.pending !== 'answer')}
            status={controls.pending === 'answer' ? 'loading' : 'idle'}
          >
            Send answer
          </Button>
        </div>
      </form>
    </div>
  );
}
