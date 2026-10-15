/**
 * AnswerPanel: the Worker's open questions, prominent, with an answer form.
 *
 * Why: when a run asks the user something it is parked until they answer, so this is the most
 *   important thing on the Ticket page and sits above the thread in amber (the only colour
 *   that means "needs you"). Sending is optimistic: the question leaves at once and a status
 *   line says it was sent. If the server refuses, the question returns with the user's words
 *   still in the box (the draft lives outside the form, state/answer-draft) and a plain
 *   explanation: a 409 means someone already answered, so retrying is pointless and the box
 *   says so; anything else offers Send again. Ctrl or Cmd + Enter sends.
 *
 * Exports: AnswerPanel.
 * Depends on: react, lucide-react, api/use-tickets, api/describe-error, domain/interaction,
 *   state/answer-draft, components/ui/button, @forge/core (type).
 */

import type { Interaction } from '@forge/core';
import { CircleAlert } from 'lucide-react';
import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import { useAnswerInteraction } from '#/api/use-tickets.js';
import { Button } from '#/components/ui/button.js';
import { KIND_LABEL, promptOf, quickReplies } from '#/domain/interaction.js';
import { useAnswerDraft, useClearAnswerDraft } from '#/state/answer-draft.js';

function QuestionCard(props: {
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
      className="grid gap-3 rounded-2xl border-2 border-attn bg-attn-soft p-4"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <p className="flex items-center gap-2 text-sm font-semibold">
        <CircleAlert aria-hidden="true" className="size-5 text-attn" />
        {KIND_LABEL[interaction.kind]}: the Worker needs your answer
      </p>
      <p className="whitespace-pre-wrap break-words text-base">{props.prompt}</p>
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

export function AnswerPanel(props: {
  ticketId: string;
  interactions: readonly Interaction[];
  /** The prompt the run streamed for an interaction, when seen. */
  streamedPrompt: (interactionId: string) => string | undefined;
}) {
  const answer = useAnswerInteraction(props.ticketId);
  const sendingId = answer.isPending ? answer.variables.interactionId : null;
  const clearDraft = useClearAnswerDraft();
  const refused = answer.isError ? answer.error : null;
  const conflict = refused instanceof ApiError && refused.status === 409;

  return (
    <div className="grid gap-3">
      {props.interactions.map((interaction) => (
        <QuestionCard
          key={interaction.id}
          interaction={interaction}
          prompt={promptOf(interaction.payload, props.streamedPrompt(interaction.id))}
          sending={sendingId === interaction.id}
          onSend={(text) =>
            answer.mutate(
              { interactionId: interaction.id, answer: text },
              { onSuccess: () => clearDraft(interaction.id) },
            )
          }
        />
      ))}
      {answer.isPending ? (
        <p role="status" className="text-sm text-muted">
          Sending your answer…
        </p>
      ) : null}
      {answer.isSuccess ? (
        <p role="status" className="text-sm">
          Answer sent. The Worker will pick it up on its next turn.
        </p>
      ) : null}
      {refused ? (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm">
          {conflict
            ? 'This question was already answered, so your answer was not sent. The page is refreshing.'
            : `Your answer was not sent. ${describeError(refused).detail} It is still in the box; press Send answer to try again.`}
        </p>
      ) : null}
    </div>
  );
}
