/**
 * Types of the lane a planned ticket is filed in.
 *
 * Why: approval needs three answers per ticket (which lane, is it Tier C, why was it raised) and
 *   names them once so the lane rule and the approval transaction agree on the shape.
 *
 * Exports: PlanTicketLane.
 * Depends on: @forge/core (Lane). Types only.
 */

import type { Lane } from '@forge/core';

/** The lane decision for one planned ticket. */
export interface PlanTicketLane {
  readonly lane: Lane;
  readonly tierC: boolean;
  /** The sentence naming why the engine raised the planner's lane, or null when it did not. */
  readonly note: string | null;
}
