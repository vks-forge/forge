/**
 * Facts `derivePhase` reads.
 *
 * Why: the phase is a pure function of a few plain facts, so the engine (which knows the live
 *   runs and jobs) and a test (which has literals) call it the same way.
 *
 * Exports: TicketPhaseFacts.
 * Depends on: schemas/card, schemas/ticket, schemas/ticket-wait. Types only.
 */

import type { CardPhase } from '#/schemas/card.js';
import type { TicketStatus } from '#/schemas/ticket.js';
import type { SchedulerWaitKind } from '#/schemas/ticket-wait.js';

export interface TicketPhaseFacts {
  readonly status: TicketStatus;
  /** A Worker run is starting or running for the ticket. */
  readonly liveRun: boolean;
  /** Forge is preparing the ticket's worktree or brief. */
  readonly setupJob: boolean;
  /** A gate, script or Director check of the ticket is in flight. */
  readonly checkJob: boolean;
  /** Pending questions or decisions the owner can answer for this ticket. */
  readonly openOwnerItems: number;
  /** Why the scheduler did not start it this tick, when it did not. */
  readonly schedulerWait?: SchedulerWaitKind;
  /** The phase of the ticket's card, when it has one. */
  readonly cardPhase?: CardPhase;
}
