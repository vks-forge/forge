/**
 * Input of the approval floor.
 *
 * Why: the floor is the deterministic gate between "the Director wants to approve" and
 *   "the plan is approved" (d-0141 item 6). It decides from facts the engine gathered, not
 *   from anything a model wrote last, so the facts are named here: the plan, the tier-C
 *   globs of the project, the files other approved cards plan to touch, and the files under
 *   the plan that changed in git since the plan was verified.
 *
 * Exports: OtherCardFiles, LighterEntry, ApprovalFloorInput.
 * Depends on: schemas/ids, schemas/plan. Types only.
 */

import type { CardId } from '#/schemas/ids.js';
import type { PlanVersion } from '#/schemas/plan.js';

/** The planned files of another card whose plan is approved and not yet done. */
export interface OtherCardFiles {
  readonly cardId: CardId;
  readonly files: readonly string[];
}

/** A planned ticket whose pipeline the Director made lighter than its lane's: what it removes (agent or stage names). */
export interface LighterEntry {
  readonly key: string;
  readonly removed: readonly string[];
}

export interface ApprovalFloorInput {
  readonly plan: Pick<PlanVersion, 'tickets' | 'verification'> &
    Partial<Pick<PlanVersion, 'decision_conflicts'>>;
  readonly tierCGlobs: readonly string[];
  readonly otherPlannedFiles: readonly OtherCardFiles[];
  /** Files under the plan that changed between the plan's `base_sha` and HEAD. */
  readonly changedSinceBase: readonly string[];
  /** Tickets whose planned pipeline removes a stage of the lane's list: a person approves those (d-0141 item 6). */
  readonly lighter?: readonly LighterEntry[];
  /** Outside claims of the plan that no verified evidence supports: the owner approves those (d-0144). */
  readonly unverified?: readonly string[];
  /** Tickets this approval would cancel that the plan does not cover (`id title`): the owner decides those. */
  readonly uncovered?: readonly string[];
  /** Kept tickets (`id title`) whose plan key the plan reuses for a new ticket: it would exist twice. */
  readonly duplicates?: readonly string[];
}
