/**
 * The one copy table of the History tab: every plain-language title and phrase.
 *
 * Why: history is read by an owner who does not code, so "waiting_human -> in_progress" must read
 *   "Resumed: you answered, so the Worker resumed". Keeping every sentence in one table means the
 *   tone stays the same across tickets and cards, and a wording change is one edit, not a hunt
 *   through the builder.
 *
 * Exports: STATUS_LABEL, stateTitle(), formatDuration(), ESCALATION_ACTION_COPY, RUN_END_COPY,
 *   WAKE_KIND_COPY, REASON_COPY, friendlyReason().
 * Depends on: schemas/escalation, schemas/ticket, schemas/wake-request. No IO.
 */

import type { EscalationAction } from '#/schemas/escalation.js';
import type { RunStatus } from '#/schemas/run.js';
import type { TicketStatus } from '#/schemas/ticket.js';
import type { WakeKind } from '#/schemas/wake-request.js';

/** The names the board and the ticket page use for each status. */
export const STATUS_LABEL: Readonly<Record<TicketStatus, string>> = {
  inbox: 'Inbox',
  planned: 'Planned',
  in_progress: 'In progress',
  blocked: 'Blocked',
  waiting_human: 'Needs you',
  verifying: 'Checking',
  review: 'In review',
  needs_signoff: 'Needs your sign-off',
  done: 'Done',
  cancelled: 'Cancelled',
};

/** Stored wait codes written before reasons were sentences. */
export const REASON_COPY: Readonly<Record<string, string>> = {
  pipeline_pending: 'its lane has no pipeline yet',
};

/** A stored reason in words an owner reads; unknown text passes through unchanged. */
export function friendlyReason(reason: string): string {
  return REASON_COPY[reason] ?? reason;
}

/** What a move to `to` is called when nothing better is known. */
function baseTitle(from: TicketStatus, to: TicketStatus): string {
  switch (to) {
    case 'in_progress':
      return from === 'planned' ? 'Started' : 'Resumed';
    case 'waiting_human':
      return 'Needs you';
    case 'blocked':
      return 'Blocked';
    case 'verifying':
      return 'Checks started';
    case 'review':
      return 'Ready for review';
    case 'needs_signoff':
      return 'Waiting for your sign-off';
    case 'done':
      return 'Done';
    case 'cancelled':
      return 'Cancelled';
    case 'planned':
      return from === 'inbox' ? 'Planned' : 'Back to planned';
    default:
      return `Moved to ${STATUS_LABEL[to]}`;
  }
}

/**
 * The title of a status change. A stored reason is already a sentence for most moves and becomes
 * the title; for the waits (`Needs you`, `Blocked`) it follows the label, as the cause.
 */
export function stateTitle(
  from: TicketStatus,
  to: TicketStatus,
  reason: string | undefined,
): string {
  if (reason === undefined || reason.trim() === '') {
    return baseTitle(from, to);
  }

  const text = friendlyReason(reason.trim());
  if (to === 'waiting_human' || to === 'blocked') {
    return `${baseTitle(from, to)}: ${text}`;
  }

  return text.charAt(0).toUpperCase() + text.slice(1);
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "45 seconds", "3 minutes", "2 hours", "2 days": the largest unit that fits, rounded. */
export function formatDuration(ms: number): string {
  const unit = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`;
  if (ms >= DAY) {
    return unit(Math.round(ms / DAY), 'day');
  }

  if (ms >= HOUR) {
    return unit(Math.round(ms / HOUR), 'hour');
  }

  if (ms >= MINUTE) {
    return unit(Math.round(ms / MINUTE), 'minute');
  }

  return unit(Math.max(1, Math.round(ms / SECOND)), 'second');
}

/** What settling an escalation says happened; `by` is added by the builder. */
export const ESCALATION_ACTION_COPY: Readonly<Record<EscalationAction, string>> = {
  answer: 'answered the question',
  retry: 'chose to retry',
  replan: 'sent the card back to the Director to re-plan',
  cancel: 'cancelled the ticket',
  run_as_express: 'chose to run it as Express',
  rework: 'sent the work back for another attempt',
  recheck: 'asked for the checks to run again',
  approve: 'approved',
  sign_off: 'signed it off',
  merge_anyway: 'chose to merge anyway',
  continue: 'chose to carry on',
  pipeline_ready: 'the lane got its pipeline, so it carried on',
  substitute: 'swapped in a substitute agent',
  allow_once: 'allowed the tool once',
  allow_always: 'allowed the tool for good',
  deny: 'refused the tool',
  skip_setup: 'chose to start without the setup steps',
};

/** How a run's end reads, for runs that did not end well. */
export const RUN_END_COPY: Readonly<Partial<Record<RunStatus, string>>> = {
  success: 'the Worker finished',
  refused: 'the Worker was refused',
  max_turns: 'the Worker ran out of turns',
  timeout: 'the Worker timed out',
  error: 'the Worker stopped with an error',
  cancelled: 'the run was cancelled',
  interrupted: 'the run was interrupted by a restart',
};

/** Why a wake was stored, in words (kinds are the stored fact; nothing else is added). */
export const WAKE_KIND_COPY: Readonly<Record<WakeKind, string>> = {
  retry: 'a retry was due',
  response_wake: 'an answer arrived',
  delegated: 'delegated work finished',
  monitor: 'the Director looked in',
  continuation: 'it carried on from the last run',
  stage: 'the next stage of its pipeline was due',
};
