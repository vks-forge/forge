/**
 * EscalationCard: the one way a waiting ticket is drawn, in the card chat, on the Ticket page and
 * in the Inbox.
 *
 * Why: when a ticket cannot go on, or finished work needs a name, it waits on the owner as one escalation, and the owner may meet
 *   it in any of three places. Drawing it three ways would mean three sets of words and three sets
 *   of bugs, and acting in one place would leave the others looking stuck. This card states what
 *   is wrong in plain words, offers exactly the actions the server listed (a question's answer
 *   form, a failure's Retry / Re-plan / Cancel, a setup's Fix in settings and check again, a held decision's findings with Merge anyway / Send back /
 *   Re-plan, a sign-off's tier and checks with Approve or Sign off, a tool approval's exact command with Allow once / Always / Deny, a failed workspace setup's step, hint and printed tail with Try again / Edit setup steps / Start without setup / Cancel), and
 *   once acted on collapses to one line saying who settled it and when; the act refreshes every
 *   screen that shows the item (api/use-escalations). While the Director is still looking, it
 *   says so and offers nothing, because the owner is not the one being asked yet. Amber means
 *   "waits on you", so only a pending owner item is amber. A refusal is explained inside the card
 *   (and the card refreshes), never as a silent failure.
 *
 * Exports: EscalationCard, escalationDomId().
 * Depends on: lucide-react, api/use-escalations, components/escalation/* (incl. decision, sign-off, permission, worktree-setup), components/ticket/ticket-link,
 *   domain/conflict-copy, domain/escalation-copy, state/use-now, schemas/escalation (type), types/escalation-ui.types.
 */

import { Check, CircleAlert, Eye } from 'lucide-react';
import { ApiError } from '#/api/api-error.js';
import { useActOnEscalation } from '#/api/use-escalations.js';
import { EscalationActions } from '#/components/escalation/escalation-actions.js';
import { EscalationDecision } from '#/components/escalation/escalation-decision.js';
import { EscalationFailure } from '#/components/escalation/escalation-failure.js';
import { EscalationPermission } from '#/components/escalation/escalation-permission.js';
import { EscalationQuestion } from '#/components/escalation/escalation-question.js';
import { EscalationWorktreeSetup } from '#/components/escalation/escalation-worktree-setup.js';
import { EscalationSetup, FixLink } from '#/components/escalation/escalation-setup.js';
import { EscalationSignOff } from '#/components/escalation/escalation-signoff.js';
import { TicketLink } from '#/components/ticket/ticket-link.js';
import { CONFLICT_ACTION_LABEL, conflictReplan } from '#/domain/conflict-copy.js';
import {
  dependentsOf,
  describeEscalationError,
  escalationTitle,
  retryHintFor,
  settledLine,
} from '#/domain/escalation-copy.js';
import type { EscalationView } from '#/schemas/escalation.js';
import { useNow } from '#/state/use-now.js';
import type { EscalationControls } from '#/types/escalation-ui.types.js';

/** DOM id of a card, so the Needs you banner can move focus to the first one. */
export const escalationDomId = (interactionId: string): string =>
  `escalation-${interactionId}`;

function Header(props: { view: EscalationView; showTicket: boolean; quiet?: boolean }) {
  const { view } = props;

  return (
    <header className="grid gap-0.5">
      <p
        className={`flex items-start gap-2 text-sm font-semibold ${props.quiet ? 'text-muted' : ''}`}
      >
        {props.quiet ? null : (
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-attn" />
        )}
        <span className="min-w-0 break-words">{escalationTitle(view)}</span>
      </p>
      {props.showTicket ? (
        <p className="min-w-0 break-words pl-0 text-xs text-muted">
          <TicketLink id={view.ticket_id} /> {view.ticket_title}
        </p>
      ) : null}
    </header>
  );
}

export function EscalationCard(props: {
  view: EscalationView;
  /** `framed` is the amber card; `plain` sits inside a surface that already frames it. */
  variant?: 'framed' | 'plain';
  /** Name the ticket under the title (the chat and the Inbox; the Ticket page is that ticket). */
  showTicket?: boolean;
  /**
   * Called with the item once there is something the owner must still be able to read although
   * the server no longer lists it as pending: it was settled by this click, or someone settled
   * it first. A list that drops settled items uses it to keep the card on screen. It is called
   * by the mutation itself, so it still fires if the refreshed list unmounts this card first.
   */
  onKeep?: (view: EscalationView) => void;
}) {
  const { view, variant = 'framed', showTicket = true } = props;
  const now = useNow(60_000);
  const mutation = useActOnEscalation(view, props.onKeep);
  const settled = view.settled ?? mutation.data?.escalation.settled;
  // An overrule is recorded with the owner's reason; the settled view does not carry it, so the
  // card that took it says it back ("Merged anyway by you: reason") for as long as it is on screen.
  const body = mutation.variables;
  const overrule =
    body !== undefined && (body.action === 'merge_anyway' || body.action === 'continue')
      ? body.comment
      : undefined;

  const controls: EscalationControls = {
    act: (body, onSuccess, onFailure) => {
      if (mutation.isPending) {
        return;
      }

      mutation.mutate(body, {
        ...(onSuccess === undefined ? {} : { onSuccess }),
        ...(onFailure === undefined ? {} : { onError: onFailure }),
      });
    },
    pending: mutation.isPending ? mutation.variables.action : null,
    error: mutation.error,
    reset: mutation.reset,
  };

  const alreadySettled =
    mutation.error instanceof ApiError && mutation.error.code === 'not_pending';

  const domId = escalationDomId(view.id);
  const frame =
    variant === 'framed' ? 'rounded-2xl border-2 border-attn bg-attn-soft p-4' : '';

  if (settled !== undefined) {
    return (
      <section
        id={domId}
        aria-label={escalationTitle(view)}
        className="grid max-w-[92%] gap-0.5 border-l-2 border-line pl-3 text-sm"
      >
        <p className="min-w-0 break-words text-muted">
          {escalationTitle(view)}
          {showTicket ? ` · ${view.ticket_id}` : ''}
        </p>
        <p className="flex items-center gap-1.5 font-medium">
          <Check aria-hidden="true" className="size-4 shrink-0 text-good" />
          {settledLine(settled, now, view.payload)}
          {overrule === undefined ? null : (
            <span className="min-w-0 break-words font-normal text-muted">
              {` · ${overrule}`}
            </span>
          )}
        </p>
      </section>
    );
  }

  if (alreadySettled) {
    return (
      <section
        id={domId}
        aria-label={escalationTitle(view)}
        className="grid max-w-[92%] gap-0.5 border-l-2 border-line pl-3 text-sm"
      >
        <p className="min-w-0 break-words text-muted">{escalationTitle(view)}</p>
        <p role="status" className="min-w-0 break-words font-medium">
          {describeEscalationError(mutation.error)}
        </p>
      </section>
    );
  }

  if (view.stage === 'director') {
    return (
      <section
        id={domId}
        aria-label={escalationTitle(view)}
        className="grid gap-1 rounded-2xl border border-line bg-surface p-4"
      >
        <Header view={view} showTicket={showTicket} quiet />
        <p role="status" className="flex items-center gap-2 text-sm">
          <Eye aria-hidden="true" className="size-4 shrink-0 text-muted" />
          Director is looking at this
        </p>
        <p className="text-xs text-muted">
          It asks you only if it cannot settle this itself.
        </p>
      </section>
    );
  }

  const { payload } = view;
  const error = mutation.error;

  return (
    <section
      id={domId}
      tabIndex={-1}
      aria-label={escalationTitle(view)}
      className={`grid min-w-0 gap-3 ${frame}`}
    >
      <Header view={view} showTicket={showTicket} />
      {payload.kind === 'question' ? (
        <EscalationQuestion id={view.id} question={payload} controls={controls} />
      ) : payload.kind === 'failure' ? (
        <EscalationFailure failure={payload} />
      ) : payload.kind === 'decision' ? (
        <EscalationDecision decision={payload} />
      ) : payload.kind === 'sign_off' ? (
        <EscalationSignOff signOff={payload} />
      ) : payload.kind === 'permission' ? (
        <EscalationPermission
          id={view.id}
          permission={payload}
          actions={view.actions}
          controls={controls}
        />
      ) : payload.cause.type === 'worktree_setup' ? (
        <EscalationWorktreeSetup
          ticketId={view.ticket_id}
          cause={payload.cause}
          fixHref={payload.fix_href}
          actions={view.actions}
          controls={controls}
        />
      ) : (
        <EscalationSetup setup={payload} />
      )}
      {payload.kind === 'permission' ||
      (payload.kind === 'setup' && payload.cause.type === 'worktree_setup') ? null : (
        <EscalationActions
          id={view.id}
          ticketId={view.ticket_id}
          actions={view.actions}
          controls={controls}
          lead={
            payload.kind === 'setup' ? <FixLink href={payload.fix_href} /> : undefined
          }
          retryHint={payload.kind === 'failure' ? retryHintFor(payload.cause) : undefined}
          labels={
            payload.kind === 'failure' && payload.cause === 'merge_conflict'
              ? CONFLICT_ACTION_LABEL
              : undefined
          }
          replan={
            payload.kind === 'failure' && payload.cause === 'merge_conflict'
              ? conflictReplan(view.ticket_id)
              : undefined
          }
        />
      )}
      {error !== null && dependentsOf(error) === null ? (
        <p role="alert" className="rounded-lg bg-danger-soft p-2 text-sm">
          {describeEscalationError(error)}
        </p>
      ) : null}
    </section>
  );
}
