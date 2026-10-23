/**
 * Shapes of the merge decision: what it reads and the closed answer it gives.
 *
 * Why: the automatic merge and the owner's "Approve and merge" must judge the same facts the same
 *   way, or a ticket the pipeline let through can be refused at the last door (CHE-10). These types
 *   are that shared contract: the gate rows and stage rows going in, a pass that names any gate the
 *   owner overruled, or a typed refusal.
 *
 * Exports: MergeDecisionInput, MergeOverride, OverriddenGate, MergeRefusal, MergeDecision.
 * Depends on: @forge/core (Gate, StageRun), types/verify. Types only.
 */

import type { Gate, StageRun } from '@forge/core';
import type { GateRows } from '#/types/verify.types.js';

/** What `decideMerge` reads; nothing here is fetched by the decision itself. */
export interface MergeDecisionInput {
  /** Latest gate row per gate of the run being merged. */
  readonly rows: GateRows;
  /** The gates the project is configured to run. */
  readonly gates: readonly Gate[];
  /** The ticket's stage rows (any cycle); only a passed G1 row of `runId` with an owner override counts. */
  readonly stages: readonly StageRun[];
  readonly runId: string;
  /** The PR head now; undefined when the caller pins the head itself (the merge door does, by sha). */
  readonly targetHead?: string;
}

/** The owner's recorded override of a stage. */
export interface MergeOverride {
  readonly by: 'owner';
  readonly action: 'merge_anyway' | 'continue';
  readonly comment: string;
  readonly at: string;
}

/** A failed gate that counts as passed because the owner overruled its stage. */
export interface OverriddenGate extends MergeOverride {
  readonly gate: string;
}

export type MergeRefusal = 'gate_failed' | 'gate_missing' | 'head_moved';

export type MergeDecision =
  | { readonly kind: 'pass'; readonly overridden: readonly OverriddenGate[] }
  | {
      readonly kind: 'fail';
      readonly reason: MergeRefusal;
      readonly gates: readonly string[];
    };
