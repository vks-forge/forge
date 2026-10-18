/**
 * Shapes of the Director check's input builder and of what the engine makes of its answer.
 *
 * Why: the check against the plan is shown typed artifacts only and its answer is turned into a
 *   recorded review by the engine, not taken at the model's word. These are the pieces that cross
 *   between the stage and the pure rules: what the builder is given, and the review plus the
 *   scope-drift flag the rules return.
 *
 * Exports: CheckInputParts, SynthesizedCheck.
 * Depends on: @forge/core (ArtifactKind, ReviewSubmission, TicketCheckInput). Types only.
 */

import type { ArtifactKind, ReviewSubmission, TicketCheckInput } from '@forge/core';

/** What `buildCheckInput` is given. */
export interface CheckInputParts {
  readonly artifacts: readonly {
    readonly kind: ArtifactKind;
    readonly content: string;
    readonly truncated: boolean;
  }[];
  readonly unplanned: readonly string[];
  readonly playbook: TicketCheckInput['playbook'];
  readonly houseRules: string;
}

/** What the engine makes of an answer: the review it records, and whether work outgrew its plan. */
export interface SynthesizedCheck {
  readonly review: ReviewSubmission;
  /** The model says out of plan and at least one changed file lies outside the plan's list. */
  readonly scopeDrift: boolean;
}
