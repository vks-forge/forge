/**
 * Shapes of worktree preparation as the engine tracks it.
 *
 * Why: installing a project's packages takes seconds to minutes, so the tick must never await it
 *   (a slow install would hold every other ticket). A preparation therefore runs as a job
 *   beside the tick, like a gate run, and the next tick finds its result in the job map. The job
 *   remembers the worktree it works in (a ticket cancelled meanwhile still has a folder to remove),
 *   when it started and which step it is on, which is all the owner's wait line shows
 *   ("Getting the workspace ready: Install packages (0:42)").
 *
 * Exports: PrepJob, PrepJobOutcome, PrepState, Preparable.
 * Depends on: @forge/core (PrepOutcome), types/verify. Types only.
 */

import type { PrepOutcome } from '@forge/core';
import type { ProjectRuntime } from '#/types/verify.types.js';

/** How a background preparation ended: the preparer's outcome, or an unexpected fault it threw. */
export type PrepJobOutcome =
  | { readonly ok: true; readonly outcome: PrepOutcome }
  | { readonly ok: false; readonly error: unknown };

/** One preparation in flight (or just finished and not yet read by a dispatch). */
export interface PrepJob {
  readonly ticketId: string;
  /** The worktree being prepared. */
  readonly worktree: string;
  /** Epoch ms the job started. */
  readonly startedAt: number;
  /** Name of the step running now; the first step's until the preparer reports one. */
  step: string;
  outcome?: PrepJobOutcome;
  /** Settles when the preparation is done and `outcome` is set (tests and shutdown await it). */
  done: Promise<void>;
}

/** What `ensurePrepared` tells its caller: start the run, wait for a later tick, or the ticket was parked. */
export type PrepState = 'ready' | 'pending' | 'failed';

/** What the preparer needs from a runtime: its preparer (absent means no setup) and its settings. */
export type Preparable = Pick<ProjectRuntime, 'prepare' | 'config'>;
