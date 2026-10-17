/**
 * Input of the one function that starts a Worker run.
 *
 * Why: a run is started from two places that must agree on everything about the run itself: the
 *   dispatch of a writer (which also moves the ticket) and the start of a check (a read-only agent
 *   that never takes the ticket). What differs is the prompt, the agent and a few rows written in
 *   the same transaction as the run row, so those come in as values and one callback; the rest
 *   (the row, the token, the request, the harness start, the pump) is shared.
 *
 * Exports: LaunchInput.
 * Depends on: @forge/core (Run, Ticket, Worktree, WorkerDriver, StorageTx, WakeRequest),
 *   types/run-agent. Types only.
 */

import type {
  Run,
  StorageTx,
  Ticket,
  WakeRequest,
  WorkerDriver,
  Worktree,
} from '@forge/core';
import type { ResolvedAgent } from '#/types/run-agent.types.js';

export interface LaunchInput {
  readonly ticket: Ticket;
  readonly agent: ResolvedAgent;
  /** The harness the run starts on (the agent's own unless the scheduler chose a fallback). */
  readonly harness: string;
  readonly driver: WorkerDriver;
  readonly wt: Worktree;
  /** The full prompt, rules included; its hash goes on the run row. */
  readonly prompt: string;
  /** The earlier run this one continues (a retry or resume), if any. */
  readonly previous: Run | null;
  readonly resumeSession?: string | undefined;
  /** The wake that asked for this run; consumed in the run-row transaction. */
  readonly wake?: WakeRequest | undefined;
  /** Extra rows written in the run-row transaction (the stage attempt, its artifacts). */
  readonly inTx?: ((tx: StorageTx, runId: string) => Promise<void>) | undefined;
}
