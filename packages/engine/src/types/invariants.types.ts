/**
 * Input shape of the per-tick invariant check.
 *
 * Why: the check is a pure function over a snapshot the engine reads once per tick;
 *   naming the snapshot lets tests state a world in a few lines (director-core.md §3).
 *
 * Exports: InvariantInput.
 * Depends on: @forge/core (Run, Ticket). Types only.
 */

import type { Run, Ticket } from '@forge/core';

export interface InvariantInput {
  readonly tickets: readonly Ticket[];
  /** Runs by id; only active ones count as a reason to wait. */
  readonly runs: ReadonlyMap<string, Run>;
  readonly pendingInteractionTickets: ReadonlySet<string>;
  readonly wakeTickets: ReadonlySet<string>;
}
