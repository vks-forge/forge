/**
 * Internal shapes of the scorecard computation.
 *
 * Why: a scorecard row is built from a subject (an agent or a pipeline shape) over the tickets it took part in, and
 *   those tickets each bring their own snapshot, stage rows and runs. Naming the two keeps the row builders and the
 *   slicing honest about what they were given and lets the arithmetic live in small functions.
 *
 * Exports: ScorecardFacts, ScorecardSubject.
 * Depends on: schemas/run, schemas/stage-run, types/scorecard-input. Types only.
 */

import type { Run } from '#/schemas/run.js';
import type { StageRun } from '#/schemas/stage-run.js';
import type {
  ScorecardSnapshot,
  ScorecardTicket,
} from '#/types/scorecard-input.types.js';

/** Everything one ticket contributes: the ticket, its snapshot, its stage rows and its runs. */
export interface ScorecardFacts {
  readonly ticket: ScorecardTicket;
  readonly snapshot: ScorecardSnapshot | undefined;
  readonly rows: readonly StageRun[];
  readonly runs: readonly Run[];
}

/** What a row is built from: the tickets, the rows and runs that count, and what kind of subject it is. */
export interface ScorecardSubject {
  readonly facts: readonly ScorecardFacts[];
  readonly rows: readonly StageRun[];
  readonly runs: readonly Run[];
  readonly kind: 'writer' | 'check' | 'shape';
  readonly substituted: number;
}
