/**
 * Types of the engine's agent fallback.
 *
 * Why: when an agent's place keeps failing the engine moves the stage to the next entry of the agent's own list, or
 *   reports that nothing is left. That answer carries what was tried (so the owner can read every try) and whether
 *   the agent asked to pause rather than have the Director pick a substitute, so it is one named value.
 *
 * Exports: TriedEntry, SlotMove.
 * Depends on: @forge/core (StageOutcome). Types only.
 */

import type { StageOutcome } from '@forge/core';

/** One place of an agent's chain that was tried in an attempt. */
export type TriedEntry = NonNullable<StageOutcome['fallback']>['tried'][number];

/** What `nextSlotTx` decided. */
export type SlotMove =
  | { readonly kind: 'moved'; readonly slot: number }
  | {
      readonly kind: 'exhausted';
      /** The agent says pause: the owner alone looks at it. */
      readonly pause: boolean;
      readonly tried: readonly TriedEntry[];
    };
