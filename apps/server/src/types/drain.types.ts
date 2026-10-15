/**
 * Types for the shutdown drain.
 *
 * Why: the graceful stop (services/shutdown.ts) and the hook handler (packages/hooks) must
 *   agree on one switch and one wait: the handler asks whether the server is draining, the
 *   shutdown sequence flips it and then waits for the runs' in-flight tool calls. A small
 *   shared interface keeps the two apart and lets tests fake the wait.
 *
 * Exports: Drain, DrainDeps.
 * Depends on: @forge/tools (ReceiptLog). Types only.
 */

import type { ReceiptLog } from '@forge/tools';

/** The switch and the wait of a graceful stop. */
export interface Drain {
  /** From now on `isDraining()` is true; there is no way back (the process is stopping). */
  begin(): void;
  isDraining(): boolean;
  /**
   * Resolves once none of `runIds` has a tool call that was allowed but has no effect receipt,
   * or after `ms`; returns the run ids still in flight (empty when every run went quiet).
   */
  awaitQuiet(runIds: readonly string[], ms: number): Promise<string[]>;
}

export interface DrainDeps {
  readonly receipts: ReceiptLog;
  /** How often the receipts are re-read while waiting; default 50 ms. */
  readonly pollMs?: number;
  /** Injectable for tests; default `setTimeout`. */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Injectable for tests; default `Date.now`. */
  readonly now?: () => number;
}
