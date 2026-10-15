/**
 * ReceiptLog port: the per-run store of hash-chained tool receipts.
 *
 * Why: receipts are written by the hook handler while a Worker runs and read later by
 *   the gates and the Ticket screen, and the chain is only worth anything if it cannot
 *   fork. Each new receipt must link to the previous one's hash and carry the next `seq`,
 *   so reading the tail and appending have to be one atomic step per run: twenty
 *   simultaneous hook posts must still produce one gap-free chain. The port is shaped
 *   around that step (`append` hands `build` a view of the tail and stores what it
 *   returns, or nothing if it throws), so the hook, the engine and any backend (SQLite,
 *   memory) agree on the guarantee without the policy ring knowing any database
 *   (tool-system.md §10, verification-plane.md §2).
 *
 * Exports: ChainView, ReceiptLog.
 * Depends on: schemas/receipt. Types only.
 */

import type { DecisionReceipt, Receipt } from '#/schemas/receipt.js';

/** Read access to a run's chain, valid only inside `ReceiptLog.append`. */
export interface ChainView {
  /** Last receipt of either kind, or null for an empty chain. */
  readonly last: Receipt | null;
  /** `seq` of the last decision, 0 for an empty chain. */
  readonly lastSeq: number;
  /** Secret generation the chain is in: 1, plus one per `resumed` receipt (d-0100). */
  readonly generation: number;
  /** Decision with this id that has no effect receipt yet. */
  openDecision(id: string): DecisionReceipt | null;
  /** Most recent decision for `tool` that has no effect receipt yet. */
  latestOpenDecision(tool: string): DecisionReceipt | null;
}

/**
 * Append-only per-run receipt store. `append` must serialise per run and be atomic: it
 * calls `build` with the current chain view and stores everything `build` returns, or
 * nothing if `build` throws or any returned receipt is rejected.
 */
export interface ReceiptLog {
  append(
    runId: string,
    build: (view: ChainView) => readonly Receipt[],
  ): Promise<readonly Receipt[]>;
  /** The run's receipts in chain order (decisions, effects and `resumed` links as written). */
  list(runId: string): Promise<readonly Receipt[]>;
}
