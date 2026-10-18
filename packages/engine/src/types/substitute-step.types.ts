/**
 * Types of the Director's substitute step.
 *
 * Why: the step first reads the ticket's stage state and finds the attempt that ran out of places to run; the
 *   rest of the step (candidates, the model call, the swap) works from that one reading, taken before any model call
 *   so no transaction is held open while the model thinks.
 *
 * Exports: SubstituteLook.
 * Depends on: @forge/core (StageRun), types/stage-runner. Types only.
 */

import type { StageRun } from '@forge/core';
import type { StageState } from '#/types/stage-runner.types.js';

/** What the first read found: the ticket's stage state and the attempt that ran out of places to run. */
export interface SubstituteLook {
  readonly slug: string;
  readonly state: StageState;
  readonly row: StageRun;
  readonly paused: ReadonlySet<string>;
  readonly projectId: string;
}
