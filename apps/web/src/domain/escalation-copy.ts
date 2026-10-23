/**
 * Escalation copy: the plain words for an escalation's title, its actions, its settled line and
 * the reasons an action can be refused.
 *
 * Why: the same escalation shows in the card chat, on the Ticket page and in the Inbox, so its
 *   words must be chosen once. Titles say what is wrong in the owner's terms ("Held: the Full
 *   lane goes live in the next update"), never an enum value; buttons name the act ("Run as Express",
 *   never `run_as_express`); a refusal is explained from the server's error code (never its
 *   message) and says what to do next. Every enum value has a sentence, and a test fails when a
 *   new cause or action arrives without one. Pure.
 *
 * Exports: ACTION_LABEL, FAILURE_TITLE, retryHintFor(), failureHelp(), escalationTitle(), settledWords(), settledLine(), replanConsequence(),
 *   describeEscalationError(), dependentsOf().
 *   (Words for the decision and sign-off bodies live in domain/finished-work-copy; the sign-off title in
 *   domain/protected-files-copy.)
 * Depends on: api/api-error, api/describe-error, domain/conflict-copy, domain/protected-files-copy, domain/relative-time, domain/setup-failure-copy, schemas/escalation,
 *   types/escalation-ui.types (types).
 */

import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import { CONFLICT_RETRY_HINT } from '#/domain/conflict-copy.js';
import { signOffTitle } from '#/domain/protected-files-copy.js';
import { timeAgo } from '#/domain/relative-time.js';
import { SETUP_SETTLED_AUTO, setupFailureTitle } from '#/domain/setup-failure-copy.js';
import type { FailurePayload } from '#/types/escalation-ui.types.js';
import type {
  DecisionCause,
  EscalationAction,
  EscalationView,
  FailureCause,
} from '#/schemas/escalation.js';

export const ACTION_LABEL: Readonly<Record<EscalationAction, string>> = {
  answer: 'Send answer',
  retry: 'Retry',
  replan: 'Re-plan',
  cancel: 'Cancel ticket',
  run_as_express: 'Run as Express',
  rework: 'Send back for rework',
  recheck: 'I fixed it, check again',
  approve: 'Approve and merge',
  sign_off: 'Sign off and merge',
  merge_anyway: 'Merge anyway',
  continue: 'Continue',
  allow_once: 'Allow once',
  allow_always: 'Always for this project',
  deny: 'Deny',
  skip_setup: 'Start without setup',
  // Settled by the engine when a held lane goes live; shown in history, never as a button.
  pipeline_ready: 'Lane went live',
  // Settled by the Director when it swaps in another agent; never offered to the owner.
  substitute: 'Switch to a substitute agent',
};

const LANE_WORD: Readonly<Record<string, string>> = {
  express: 'Express',
  standard: 'Standard',
  full: 'Full',
};

/** The title of a failure by cause; `lane_hold` names the lane when the server did. */
export const FAILURE_TITLE: Readonly<Record<FailureCause, (lane?: string) => string>> = {
  lane_hold: (lane) =>
    `Held: the ${lane === undefined ? '' : `${LANE_WORD[lane] ?? lane} `}lane goes live in the next update`,
  rework_cap: () => 'Stopped: reworked too many times',
  retry_cap: () => 'Stopped: retried too many times',
  rewake_cap: () => 'Stopped: woken too many times',
  not_retried: () => 'Stopped: this kind of failure is not retried by itself',
  max_turns: () => 'Stopped: the Worker ran out of turns',
  refused: () => 'Stopped: the Worker refused the task',
  question_timeout: () => 'Stopped: a question went unanswered',
  no_agent_available: () => 'No agent could run this stage',
  merge_conflict: () => 'Another ticket changed the same lines first',
};

/** The title of a held decision by cause. */
const DECISION_TITLE: Readonly<Record<DecisionCause, (stage: string) => string>> = {
  findings_hold: (stage) => `Held: ${stage} found problems that need your decision`,
  config_hold: () =>
    'Held: the Worker changed files that control how its work is checked',
  provenance_hold: () => 'Held: Forge cannot prove who changed these files',
  scope_drift: () => 'Held: the work went beyond its plan',
};

/** One line under a Retry that does something other than it says, or `undefined` when it does what it says. */
export function retryHintFor(cause: FailureCause): string | undefined {
  if (cause === 'rework_cap') {
    return 'This gives it exactly one more attempt.';
  }

  if (cause === 'merge_conflict') {
    return CONFLICT_RETRY_HINT;
  }

  return cause === 'no_agent_available'
    ? 'This starts again from the agent’s first choice, with every fallback available again.'
    : undefined;
}

/** What a failure cause means for the owner and what each way out does; `undefined` when the summary says enough. */
export function failureHelp(
  cause: FailureCause,
  family: FailurePayload['error_family'],
): string | undefined {
  if (cause !== 'no_agent_available') {
    return undefined;
  }

  const why =
    family === 'model_unavailable'
      ? 'The model it was set to is not available. '
      : family === 'rate_limit'
        ? 'The harness kept refusing because of rate limits. '
        : '';

  return `${why}Every place this agent can run was tried, and the Director could not switch to another agent. Retry tries again, Re-plan changes what the ticket needs, Cancel stops it.`;
}

/** The one-line title of an escalation, in plain words. */
export function escalationTitle(
  view: Pick<EscalationView, 'payload'> & { ticket_id?: string },
): string {
  const { payload } = view;

  if (payload.kind === 'question') {
    return payload.source === 'report_blocked'
      ? 'The Worker is stuck and needs you'
      : 'The Worker has a question';
  }

  if (payload.kind === 'failure') {
    return FAILURE_TITLE[payload.cause](payload.lane);
  }

  if (payload.kind === 'decision') {
    return DECISION_TITLE[payload.cause](payload.stage_label);
  }

  if (payload.kind === 'sign_off') {
    return signOffTitle(payload.cause, payload.director_note);
  }

  if (payload.kind === 'permission') {
    return 'Tool approval';
  }

  const { cause } = payload;

  if (cause.type === 'login') {
    return `Setup needed: sign in to ${cause.harness_id}`;
  }

  if (cause.type === 'tool') {
    return `Setup needed: approve the tool ${cause.tool}`;
  }

  if (cause.type === 'worktree_setup') {
    return setupFailureTitle(view.ticket_id);
  }

  return `Setup needed: ${cause.harness_kind} changed, check it again`;
}

const SETTLED_VERB: Readonly<Record<string, string>> = {
  answer: 'Answered',
  retry: 'Retried',
  replan: 'Sent back to planning',
  cancel: 'Cancelled',
  run_as_express: 'Released as Express',
  rework: 'Sent back for rework',
  recheck: 'Checked and resumed',
  approve: 'Approved and merged',
  sign_off: 'Signed off and merged',
  merge_anyway: 'Merged anyway',
  continue: 'Continued as is',
  allow_once: 'Allowed once',
  allow_always: 'Allowed for this project',
  deny: 'Denied',
  skip_setup: 'Started without setup',
  substitute: 'Switched to a substitute agent',
};

/** "Answered by you": what was done and by whom, without a time. */
export function settledWords(
  action: string,
  by: 'owner' | 'director' | 'auto',
  afterSetupEdit: boolean = false,
): string {
  if (by === 'auto') {
    return afterSetupEdit ? SETUP_SETTLED_AUTO : 'Resumed by itself once it was fixed';
  }

  if (action === 'substitute') {
    return 'The Director switched to a substitute agent';
  }

  const verb = SETTLED_VERB[action] ?? 'Settled';

  return `${verb} by ${by === 'owner' ? 'you' : 'the Director'}`;
}

/** "Answered by you · 2 min ago": who settled it and when. */
export function settledLine(
  settled: NonNullable<EscalationView['settled']>,
  now: number,
  payload?: EscalationView['payload'],
): string {
  const afterSetupEdit =
    payload?.kind === 'setup' && payload.cause.type === 'worktree_setup';

  return `${settledWords(settled.action, settled.by, afterSetupEdit)} · ${timeAgo(settled.at, now)}`;
}

/** What Re-plan does to the card's tickets, said before the owner confirms. */
export function replanConsequence(): string {
  return 'The card goes back to planning with your comment. This ticket stays parked. Tickets that have not started are replaced when you approve the new plan; running and finished tickets stay.';
}

const BY_CODE: Readonly<Record<string, string>> = {
  not_pending:
    'This was already settled, by you elsewhere or by the Director, so nothing more was sent.',
  action_not_offered:
    'That action is not available for this any more. The page is refreshing with what is.',
  stale:
    'The ticket moved on since this page loaded, so nothing was changed. The page is refreshing.',
  interaction_not_found: 'This item no longer exists. The page is refreshing.',
  ticket_not_found: 'This ticket no longer exists. The page is refreshing.',
  head_moved:
    'The pull request changed after the checks passed, so nothing was merged. It is being checked again; approve once it is back in review.',
  invalid_answer: 'That answer was not accepted. Check what you entered and try again.',
  invalid_body:
    'Forge could not read that request. Check what you entered and try again.',
};

/** Why an act was refused, in words. `still_broken` carries the server's own detail. */
export function describeEscalationError(error: unknown): string {
  if (error instanceof ApiError && error.kind === 'http') {
    if (error.code === 'still_broken') {
      const detail = detailOf(error.body);

      return detail === undefined
        ? 'It is still not fixed. Fix it, then check again.'
        : `It is still not fixed: ${detail} Fix it, then check again.`;
    }

    if (error.code === 'merge_refused') {
      const detail = detailOf(error.body);

      return detail === undefined
        ? 'The change could not be merged, so nothing was merged.'
        : `The change could not be merged: ${detail}`;
    }

    const known = error.code === undefined ? undefined : BY_CODE[error.code];
    if (known !== undefined) {
      return known;
    }
  }

  const { title, detail } = describeError(error);

  return `${title}. ${detail}`;
}

function errorExtras(body: unknown): Record<string, unknown> {
  const error =
    body !== null && typeof body === 'object'
      ? (body as Record<string, unknown>)['error']
      : undefined;

  return error !== null && typeof error === 'object'
    ? (error as Record<string, unknown>)
    : {};
}

function detailOf(body: unknown): string | undefined {
  const detail = errorExtras(body)['detail'];

  return typeof detail === 'string' && detail.trim() !== '' ? detail : undefined;
}

/** The tickets that block a plain cancel, from a `ticket_has_dependents` refusal; else null. */
export function dependentsOf(error: unknown): readonly string[] | null {
  if (!(error instanceof ApiError) || error.code !== 'ticket_has_dependents') {
    return null;
  }

  const list = errorExtras(error.body)['dependents'];

  return Array.isArray(list)
    ? list.filter((id): id is string => typeof id === 'string')
    : [];
}
