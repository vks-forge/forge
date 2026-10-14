/**
 * Arguments of the receipt wait.
 *
 * Why: the supervisor and any engine that needs a decision receipt wait for it the same
 *   way; one argument bag keeps the wait a plain function with no hidden state.
 *
 * Exports: AwaitDecisionArgs.
 * Depends on: types/claude/driver-deps. Types only.
 */

import type { Clock, Logger, ReceiptLookup } from '#/types/claude/driver-deps.types.js';

export interface AwaitDecisionArgs {
  readonly receipts: ReceiptLookup;
  readonly clock: Clock;
  readonly log: Logger;
  readonly runId: string;
  readonly graceMs: number;
  /** True once the run is settling; the wait then ends after one more lookup. */
  readonly settling: () => boolean;
}
