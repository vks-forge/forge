/**
 * Escalation actions — what the owner may do about each way a ticket waits.
 *
 * Why: a ticket that waits with nothing to click on is a dead end the owner cannot leave without
 *   editing the database (d-0135). Every waiting state has a row here: a question can be answered
 *   or its ticket cancelled; a lane hold can be run as Express, re-planned or cancelled; a capped
 *   or refused failure can be retried, re-planned or cancelled; a setup problem is fixed outside
 *   and re-checked; finished work can be sent back for rework. The same tables serve the engine
 *   (it refuses an action that was not offered), the server (it returns the list in each view) and
 *   the tests (a rule test fails when a status, cause or setup type has no row). Order is button
 *   order. "Fix in settings" is a link in the setup payload, not an action.
 *
 * Exports: QUESTION_ACTIONS, FAILURE_ACTIONS, SETUP_ACTIONS, REVIEW_ACTIONS, SCHEDULER_WAIT_KINDS,
 *   STATUS_WAIT_CLASS, escalationActions(), ticketWaitActions().
 * Depends on: schemas/escalation, schemas/ticket, types/escalation. No IO.
 */

import type {
  EscalationAction,
  EscalationPayload,
  FailureCause,
} from '#/schemas/escalation.js';
import type { TicketStatus } from '#/schemas/ticket.js';
import type {
  ActionContext,
  EscalationBase,
  WaitClass,
  WaitTicket,
} from '#/types/escalation.types.js';

export const QUESTION_ACTIONS: readonly EscalationAction[] = ['answer', 'cancel'];
export const SETUP_ACTIONS: readonly EscalationAction[] = ['recheck', 'cancel'];
export const REVIEW_ACTIONS: readonly EscalationAction[] = ['rework', 'cancel'];

const RETRYABLE: readonly EscalationAction[] = ['retry', 'replan', 'cancel'];

/** The actions of each failure cause; a new cause without a row is a type error. */
export const FAILURE_ACTIONS: Readonly<
  Record<FailureCause, readonly EscalationAction[]>
> = {
  lane_hold: ['run_as_express', 'replan', 'cancel'],
  rework_cap: RETRYABLE,
  retry_cap: RETRYABLE,
  rewake_cap: RETRYABLE,
  not_retried: RETRYABLE,
  max_turns: RETRYABLE,
  refused: RETRYABLE,
  question_timeout: RETRYABLE,
};

/** The kinds of scheduler wait the ticket page words as `<kind>: ...` (dependencies, a cap, a parked harness, a retry backoff, a card being re-planned). */
export const SCHEDULER_WAIT_KINDS = ['deps', 'cap', 'quota', 'retry', 'plan'] as const;

/** How each status can make a ticket wait; a new status without a row is a type error. */
export const STATUS_WAIT_CLASS: Readonly<Record<TicketStatus, WaitClass>> = {
  inbox: 'scheduler',
  planned: 'scheduler',
  in_progress: 'scheduler',
  verifying: 'scheduler',
  blocked: 'owner',
  waiting_human: 'owner',
  review: 'review',
  needs_signoff: 'review',
  done: 'none',
  cancelled: 'none',
};

/** Without a card to go back to, a re-plan has nowhere to go. */
const withoutReplan = (actions: readonly EscalationAction[]): EscalationAction[] =>
  actions.filter((a) => a !== 'replan');

/** The actions offered for one escalation payload, in button order. */
export function escalationActions(
  payload: EscalationPayload,
  context: ActionContext,
): EscalationAction[] {
  const table =
    payload.kind === 'question'
      ? QUESTION_ACTIONS
      : payload.kind === 'failure'
        ? FAILURE_ACTIONS[payload.cause]
        : SETUP_ACTIONS;

  return context.replannable ? [...table] : withoutReplan(table);
}

const unique = (actions: readonly EscalationAction[]): EscalationAction[] => [
  ...new Set(actions),
];

/**
 * What a ticket page offers for the ticket's own wait: the pending owner escalations' actions for
 * a waiting ticket (cancel alone while the Director is still looking, or when no escalation
 * exists yet), Rework and Cancel for finished work, Cancel for a ticket the scheduler holds back,
 * nothing for one that is running or finished. `schedulerWait` is the ticket page's wait line.
 */
export function ticketWaitActions(
  ticket: WaitTicket,
  pending: readonly EscalationBase[],
  schedulerWait: string | null,
): EscalationAction[] {
  switch (STATUS_WAIT_CLASS[ticket.status]) {
    case 'owner': {
      const owned = pending.filter((p) => p.stage === 'owner' && p.status === 'pending');
      if (owned.length === 0) {
        return ['cancel'];
      }

      return unique(owned.flatMap((p) => escalationActions(p.payload, ticket)));
    }

    case 'review':
      return [...REVIEW_ACTIONS];
    case 'scheduler':
      return schedulerWait === null ? [] : ['cancel'];
    case 'none':
      return [];
  }
}
