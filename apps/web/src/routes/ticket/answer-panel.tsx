/**
 * AnswerPanel: everything on the Ticket page that waits on the owner, prominent, with the way
 *   to act on it.
 *
 * Why: when a ticket cannot go on it is parked until the owner acts, so this is the most
 *   important thing on the Ticket page and sits above the thread in amber (the only colour
 *   that means "needs you"). Escalations (a question, a failure, a setup to fix) draw as the same
 *   card the chat and the Inbox use; while the Director is still looking at one, the panel says so
 *   and offers nothing; a wait with no question (a scheduler hold) shows its actions below; review,
 *   sign-off and a held decision belong to the Review tab while that tab exists (`reviewTab`), so
 *   they are not drawn twice. A question from a server that predates escalations keeps the plain
 *   form below.
 *   Sending is optimistic: the question leaves at once and a status
 *   line says it was sent. If the server refuses, the question returns with the user's words
 *   still in the box (the draft lives outside the form, state/answer-draft) and a plain
 *   explanation: a 409 means someone already answered, so retrying is pointless and the box
 *   says so; anything else offers Send again. Ctrl or Cmd + Enter sends.
 *
 * Exports: AnswerPanel.
 * Depends on: lucide-react, api/use-tickets, api/describe-error, domain/interaction, domain/route-tabs,
 *   state/answer-draft, components/ui/button, components/escalation/escalation-card,
 *   routes/ticket/ticket-wait, schemas/tickets (type), @forge/core (type).
 */

import type { Interaction } from '@forge/core';
import { CircleAlert } from 'lucide-react';
import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import { useAnswerInteraction } from '#/api/use-tickets.js';
import { EscalationCard } from '#/components/escalation/escalation-card.js';
import { Button } from '#/components/ui/button.js';
import { KIND_LABEL, promptOf, quickReplies } from '#/domain/interaction.js';
import { isReviewItem } from '#/domain/route-tabs.js';
import { TicketWait } from '#/routes/ticket/ticket-wait.js';
import type { EscalationView } from '#/schemas/escalation.js';
import type { TicketDetail } from '#/schemas/tickets.js';
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
  detail: TicketDetail;
  /** The ticket's escalations with the just-settled ones kept (state/use-kept-escalations). */
  escalations: readonly EscalationView[];
  onKeep: (view: EscalationView) => void;
  /** True while the Review tab exists: it draws held-decision and sign-off items and the review actions itself. */
  reviewTab?: boolean;
  /** The prompt the run streamed for an interaction, when seen. */
  streamedPrompt: (interactionId: string) => string | undefined;
}) {
  const { detail } = props;
  const ticketId = detail.ticket.id;
  const shown = props.escalations;
  // A held decision or a sign-off lives on the Review tab while that tab exists; here it would be
  // a second set of the same buttons.
  const drawn =
    props.reviewTab === true ? shown.filter((item) => !isReviewItem(item)) : shown;

  // While only the Director is looking at a wait, the owner still keeps Cancel: it comes from
  // `wait_actions`, drawn by TicketWait under the Director card.
  const ownerHasItem = shown.some(
    (item) => item.stage === 'owner' && item.settled === undefined,
  );

  const covered = new Set(shown.map((item) => item.id));
  const legacy = detail.interactions.filter((item) => !covered.has(item.id));
  const answer = useAnswerInteraction(ticketId);
  const sendingId = answer.isPending ? answer.variables.interactionId : null;
  const clearDraft = useClearAnswerDraft();
  const refused = answer.isError ? answer.error : null;
  const conflict = refused instanceof ApiError && refused.status === 409;

  return (
    <div className="grid gap-3">
      {drawn.map((view) => (
        <EscalationCard
          key={view.id}
          view={view}
          showTicket={false}
          onKeep={props.onKeep}
        />
      ))}
      {!ownerHasItem && legacy.length === 0 && props.reviewTab !== true ? (
        <TicketWait detail={detail} />
      ) : null}
      {legacy.map((interaction) => (
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
