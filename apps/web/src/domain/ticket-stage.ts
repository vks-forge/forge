/**
 * Where a ticket is on its way to done, as a five-step track.
 *
 * Why: the board groups tickets by ten statuses, but at a glance on Home the owner needs one
 *   answer per ticket: how far along is it, and is it stuck on me? The ten statuses fold into
 *   five stages (Planned, Building, Verifying, Review, Done). Blocked and waiting-for-a-person
 *   sit at the stage where they stopped, so the track shows progress and the `needs_you` flag
 *   (set by the server from the state machine, never guessed here) shows who must move.
 *
 * Exports: STAGES, stageOf(), IN_PROGRESS_STATUSES.
 * Depends on: @forge/core (TicketStatus type). Pure.
 */

import type { TicketStatus } from '@forge/core';

export const STAGES = ['Planned', 'Building', 'Verifying', 'Review', 'Done'] as const;

const STAGE_INDEX: Readonly<Record<TicketStatus, number>> = {
  inbox: 0,
  planned: 0,
  in_progress: 1,
  blocked: 1,
  waiting_human: 1,
  verifying: 2,
  review: 3,
  needs_signoff: 3,
  done: 4,
  cancelled: 0,
};

/** Zero-based index into STAGES. */
export const stageOf = (status: TicketStatus): number => STAGE_INDEX[status];

/** The statuses "In progress" lists: work that has started and is not finished. */
export const IN_PROGRESS_STATUSES: readonly TicketStatus[] = [
  'planned',
  'in_progress',
  'blocked',
  'waiting_human',
  'verifying',
  'review',
  'needs_signoff',
];
