/**
 * LegacyQuestion: the plain answer form for a Worker question that has no escalation card.
 *
 * Why: a server that predates escalations still parks a ticket on a pending question, and the
 *   owner must be able to answer it from the Ticket page. The form lives in the needs-you dock
 *   (its title already says the Worker needs an answer). The text is the question as the Worker
 *   asked it, quick replies fill the box, the draft survives a refused send (state/answer-draft),
 *   and Ctrl or Cmd + Enter sends. Sent once; the run resumes with the answer.
 *
 * Exports: LegacyQuestion.
 * Depends on: components/ui/button, domain/interaction, state/answer-draft, @forge/core (type).
 */

import type { Interaction } from '@forge/core';
import { Button } from '#/components/ui/button.js';
import { quickReplies } from '#/domain/interaction.js';
import { useAnswerDraft } from '#/state/answer-draft.js';

export function LegacyQuestion(props: {
  interaction: Interaction;
  prompt: string;
  sending: boolean;
  onSend: (text: string) => void;
}) {
  const { interaction } = props;
  const { draft, setDraft } = useAnswerDraft(interaction.id);
  const id = `answer-${interaction.id}`;
  const chips = quickReplies(interaction.kind);
  const send = (): void => {
    if (draft.trim() !== '' && !props.sending) {
      props.onSend(draft.trim());
    }
  };

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <p className="whitespace-pre-wrap break-words text-sm">{props.prompt}</p>
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-2" aria-label="Quick answers">
          {chips.map((chip) => (
            <Button key={chip} onClick={() => setDraft(chip)}>
              {chip}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="grid gap-1">
        <label htmlFor={id} className="text-sm font-medium">
          Your answer
        </label>
        <textarea
          id={id}
          rows={3}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              send();
            }
          }}
          className="min-w-0 resize-y rounded-lg border border-line bg-surface p-2 text-sm"
        />
        <p className="text-xs text-muted">
          Sent once; the run resumes with it. Ctrl+Enter sends.
        </p>
      </div>
      <div>
        <Button
          type="submit"
          variant="primary"
          disabled={draft.trim() === ''}
          status={props.sending ? 'loading' : 'idle'}
        >
          Send answer
        </Button>
      </div>
    </form>
  );
}
