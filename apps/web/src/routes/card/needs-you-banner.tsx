/**
 * NeedsYouBanner: the pinned notice that a card is waiting on the owner, with its actions.
 *
 * Why: when the Director cannot go on (a question to answer, a plan to approve, a card that has
 *   not been planned yet, a held ticket) the card sits in Needs you, and the owner must see why
 *   and be able to act without hunting (d-0135: a waiting state with only reason text is a
 *   bug). The banner states the Director's reason and shows one button per action it listed,
 *   each in the owner's words ("Review and approve", not `approve_plan`). It stays above both the
 *   chat and the side panel so it is visible on every tab and every screen size. `run_as_express`
 *   needs a ticket: when the raise names one the button runs it, otherwise the button takes the
 *   owner to the Tickets tab to choose, so it is never a dead end.
 *
 *   `raise_step_budget` is a link to Settings → Limits (a place to go, not a call to make); `retry_step`
 *   is a button that re-runs the planning step.
 *
 * Exports: NeedsYouBanner, ACTION_LABEL, STEP_BUDGET_SETTINGS.
 * Depends on: react, react-router, lucide-react, components/ui/button, schemas/card-events (types).
 */

import { CircleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '#/components/ui/button.js';
import type { NeedsYou, NeedsYouAction } from '#/schemas/card-events.js';

export const ACTION_LABEL: Readonly<Record<NeedsYouAction, string>> = {
  answer: 'Answer the question',
  approve_plan: 'Review and approve',
  request_changes: 'Request changes',
  start_planning: 'Start planning',
  run_as_express: 'Run as Express',
  raise_step_budget: 'Raise the step budget',
  retry_step: 'Retry the step',
};

/** Settings page that holds the Director step budget field. */
export const STEP_BUDGET_SETTINGS = '/settings/limits';

export function NeedsYouBanner(props: {
  needs: NeedsYou;
  /** The action in flight, so its button shows a spinner and cannot be clicked twice. */
  busy: NeedsYouAction | null;
  /** Why the last action failed, in words. */
  error: string | null;
  onAction: (action: NeedsYouAction) => void;
}) {
  const { needs } = props;

  return (
    <section
      aria-label="Needs you"
      className="grid gap-3 rounded-2xl border-2 border-attn bg-attn-soft p-4"
    >
      <p className="flex items-start gap-2 text-sm font-semibold">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-attn" />
        <span className="min-w-0 break-words">{needs.reason}</span>
      </p>
      {needs.actions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {needs.actions.map((action, index) =>
            action === 'raise_step_budget' ? (
              <Link
                key={action}
                to={STEP_BUDGET_SETTINGS}
                className="inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-lg border border-line bg-surface px-3 text-sm font-medium text-fg hover:bg-hover"
              >
                {ACTION_LABEL[action]}
              </Link>
            ) : (
              <Button
                key={action}
                variant={index === 0 ? 'primary' : 'quiet'}
                status={props.busy === action ? 'loading' : 'idle'}
                disabled={props.busy !== null}
                onClick={() => props.onAction(action)}
              >
                {action === 'run_as_express' && needs.ticket_id === undefined
                  ? 'Choose a ticket'
                  : ACTION_LABEL[action]}
              </Button>
            ),
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">
          Tell the Director what to do in the chat message box.
        </p>
      )}
      {props.error !== null ? (
        <p role="alert" className="rounded-lg bg-danger-soft p-2 text-sm">
          {props.error}
        </p>
      ) : null}
    </section>
  );
}
