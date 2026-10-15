/**
 * Input of `computeProjectStats`.
 *
 * Why: the Home figures are computed from three row sets the server reads from storage
 *   (tickets, runs of the window, gate verdicts). Naming the bundle keeps the pure function
 *   independent of how those rows were read and lets tests build it by hand.
 *
 * Exports: ProjectStatsInput.
 * Depends on: schemas/gate-result, schemas/run, schemas/stats-range, schemas/ticket. Types only.
 */

import type { GateResult } from '#/schemas/gate-result.js';
import type { Run } from '#/schemas/run.js';
import type { StatsRange } from '#/schemas/stats-range.js';
import type { Ticket } from '#/schemas/ticket.js';

export interface ProjectStatsInput {
  readonly project: string;
  readonly range: StatsRange;
  readonly nowMs: number;
  /** Every ticket of the project. */
  readonly tickets: readonly Ticket[];
  /** Runs of the project started inside the window. */
  readonly runs: readonly Run[];
  /** Gate verdicts of those runs (other gates are ignored). */
  readonly gates: readonly GateResult[];
  /** Runs `starting` or `running` right now, wherever they started. */
  readonly activeRuns: number;
}
