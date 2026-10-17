/**
 * Input of `computeOverviewStats`.
 *
 * Why: the Overview sums facts across projects. The server reads each project's rows from
 *   storage and hands them over per project; naming the bundle keeps the pure function
 *   independent of how rows were read and lets tests build it by hand.
 *
 * Exports: OverviewProjectInput, OverviewStatsInput.
 * Depends on: schemas/gate-result, inbox, project, run, stats-range, ticket. Types only.
 */

import type { GateResult } from '#/schemas/gate-result.js';
import type { InboxItem } from '#/schemas/inbox.js';
import type { ProjectStatus } from '#/schemas/project.js';
import type { Run } from '#/schemas/run.js';
import type { StatsGroup, StatsRange } from '#/schemas/stats-range.js';
import type { Ticket } from '#/schemas/ticket.js';

export interface OverviewProjectInput {
  readonly slug: string;
  readonly status: ProjectStatus;
  /** Every ticket of the project. */
  readonly tickets: readonly Ticket[];
  /** Runs started since `overviewRunsSince()` (all of them for `all`). */
  readonly runs: readonly Run[];
  /** G1 verdicts of those runs. */
  readonly gates: readonly GateResult[];
  /** Runs `starting` or `running` right now. */
  readonly activeRuns: number;
  /** Cards not yet done or closed. */
  readonly openCards: number;
  /** The project's inbox items that wait on a decision. */
  readonly needsAction: readonly InboxItem[];
}

export interface OverviewStatsInput {
  readonly range: StatsRange;
  readonly group: StatsGroup;
  readonly nowMs: number;
  /** Minutes east of UTC on the server's clock: where `today` starts and how hours are cut. Default 0. */
  readonly utcOffsetMinutes?: number;
  readonly projects: readonly OverviewProjectInput[];
  /** Requested slugs that matched no project. */
  readonly unknown: readonly string[];
}
