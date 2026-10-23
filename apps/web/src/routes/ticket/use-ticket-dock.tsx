/**
 * `useTicketDock()`: turns the ticket's waiting items into dock items whose content acts in place.
 *
 * Why: the server says what waits on the owner (`needs_you_detail` on the ticket detail); this
 *   hook gives each item the means to act, so the owner decides next to the Worker thread
 *   instead of on a tab. A Worker's question, a failure, a setup to fix, a held decision and a
 *   sign-off and a tool approval (the exact command with Allow once / Always / Deny) each open as the same escalation card the card chat and the Inbox draw (acting in
 *   one place settles all three); finished work waiting for review or sign-off with no
 *   escalation of its own shows the actions the server offers (merge stays behind its confirm).
 *   A question from a server that predates escalations keeps its plain answer form. The review
 *   evidence is one link away ("Open the review"). Around the dock sit three quiet things that
 *   are not items: the one-line record of what the owner just settled (kept until they leave) and
 *   an escalation the Director is still looking at, the scheduler hold that offers only Cancel,
 *   and the status of a plain answer.
 *
 * Exports: useTicketDock().
 * Depends on: react, api/use-tickets, api/describe-error, components/escalation/escalation-card,
 *   domain/escalation-copy, domain/interaction, domain/needs-you-dock, domain/ticket-rail, routes/ticket/*, schemas/*,
 *   state/answer-draft, types/needs-you-dock.types.
 */

import type { ReactNode } from 'react';
import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import { useAnswerInteraction } from '#/api/use-tickets.js';
import { EscalationCard } from '#/components/escalation/escalation-card.js';
import { describeEscalationError, escalationTitle } from '#/domain/escalation-copy.js';
import { KIND_LABEL, promptOf } from '#/domain/interaction.js';
import { dockKey, orderDockItems } from '#/domain/needs-you-dock.js';
import { ticketHoldWithoutItem, uncoveredInteractions } from '#/domain/ticket-rail.js';
import { LegacyQuestion } from '#/routes/ticket/legacy-question.js';
import { TicketWait } from '#/routes/ticket/ticket-wait.js';
import type { EscalationView } from '#/schemas/escalation.js';
import type { TicketDetail } from '#/schemas/tickets.js';
import { useClearAnswerDraft } from '#/state/answer-draft.js';
import type { DockView } from '#/types/needs-you-dock.types.js';

// A kept owner item the server no longer lists as pending was settled elsewhere (the owner's own
// act, or the Director) while this page was open; the card that took the refusal has left the dock.
const ALREADY_SETTLED = describeEscalationError(
  new ApiError('http', 'interaction is not pending', {
    status: 409,
    code: 'not_pending',
  }),
);

export function useTicketDock(input: {
  detail: TicketDetail;
  /** The ticket's escalations with the just-settled ones kept (state/use-kept-escalations). */
  escalations: readonly EscalationView[];
  onKeep: (view: EscalationView) => void;
  hasReview: boolean;
  /** Opens the Review view (the dock's "Open the review" link). */
  openReview: () => void;
  /** The prompt the run streamed for an interaction, when seen. */
  streamedPrompt: (interactionId: string) => string | undefined;
}): { views: readonly DockView[]; after: ReactNode } {
  const { detail, escalations, onKeep } = input;
  const answer = useAnswerInteraction(detail.ticket.id);
  const clearDraft = useClearAnswerDraft();
  const sendingId = answer.isPending ? answer.variables.interactionId : null;
  const refused = answer.isError ? answer.error : null;
  const conflict = refused instanceof ApiError && refused.status === 409;

  const items = orderDockItems(detail.needs_you_detail);
  const legacy = uncoveredInteractions(detail.interactions, escalations);
  const link = input.hasReview
    ? { label: 'Open the review', onRun: input.openReview }
    : undefined;

  const fromServer = items.map((item): DockView => {
    const live =
      item.interaction_id === undefined
        ? undefined
        : escalations.find((view) => view.id === item.interaction_id);

    const base = {
      key: dockKey(item),
      kind: item.kind,
      title: item.title,
      raisedAt: item.raised_at,
      // A tool approval's card says its own why; the server's chips would repeat it.
      reasons: item.kind === 'tool_approval' ? [] : item.items,
      ...(item.kind === 'ticket_escalation' || link === undefined ? {} : { link }),
    };

    if (live !== undefined) {
      return {
        ...base,
        body: (
          <EscalationCard
            view={live}
            variant="plain"
            showTicket={false}
            onKeep={onKeep}
          />
        ),
      };
    }

    // Finished work with no escalation of its own: the server's own list of what may be done.
    return item.interaction_id === undefined && detail.wait_actions.length > 0
      ? { ...base, body: <TicketWait detail={detail} variant="plain" /> }
      : base;
  });

  const fromOldServer = legacy.map((interaction): DockView => ({
    key: `legacy:${interaction.id}`,
    kind: 'ticket_escalation',
    title: `${KIND_LABEL[interaction.kind]}: the Worker needs your answer`,
    reasons: [],
    body: (
      <LegacyQuestion
        interaction={interaction}
        prompt={promptOf(interaction.payload, input.streamedPrompt(interaction.id))}
        sending={sendingId === interaction.id}
        onSend={(text) =>
          answer.mutate(
            { interactionId: interaction.id, answer: text },
            { onSuccess: () => clearDraft(interaction.id) },
          )
        }
      />
    ),
  }));

  const views = [...fromServer, ...fromOldServer];
  const open = new Set(items.map((item) => item.interaction_id));
  // Settled by the owner (kept as one line) or still with the Director (it says so, offers nothing).
  const around = escalations.filter((view) => !open.has(view.id));

  const hold = ticketHoldWithoutItem({
    hasReview: input.hasReview,
    ownerItems: items.length,
    legacyQuestions: legacy.length,
    waitActions: detail.wait_actions.length,
  });

  const after = (
    <>
      {around.map((view) => (
        <div key={view.id} className="mb-2">
          {view.settled === undefined && view.stage === 'owner' ? (
            <p role="status" className="text-sm">
              <span className="text-muted">{escalationTitle(view)}. </span>
              {ALREADY_SETTLED}
            </p>
          ) : (
            <EscalationCard view={view} showTicket={false} onKeep={onKeep} />
          )}
        </div>
      ))}
      {hold ? (
        <div className="mb-2">
          <TicketWait detail={detail} />
        </div>
      ) : null}
      {answer.isPending ? (
        <p role="status" className="mb-2 text-sm text-muted">
          Sending your answer…
        </p>
      ) : null}
      {answer.isSuccess ? (
        <p role="status" className="mb-2 text-sm">
          Answer sent. The Worker will pick it up on its next turn.
        </p>
      ) : null}
      {refused ? (
        <p role="alert" className="mb-2 rounded-lg bg-danger-soft p-3 text-sm">
          {conflict
            ? 'This question was already answered, so your answer was not sent. The page is refreshing.'
            : `Your answer was not sent. ${describeError(refused).detail} It is still in the box; press Send answer to try again.`}
        </p>
      ) : null}
    </>
  );

  return { views, after };
}
