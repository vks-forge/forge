/**
 * SQLite ReceiptLog: the per-run hash chain in `tool_decisions` and `tool_effects`.
 *
 * Why: the gates trust a Worker's tool receipts only if the chain survives the Forge
 *   server restarting and many hook posts landing at once. This is the durable log
 *   behind the hook handler. Reading the chain head, building the next receipts and
 *   inserting them happen in one `BEGIN IMMEDIATE` transaction on the same connection
 *   and the same mutex as `StorageAdapter`, so concurrent posts, and other Director
 *   writes, queue instead of interleaving: `seq` and `prev_hash` stay correct and the
 *   chain cannot fork. If `build` throws or any receipt is rejected (wrong run, reused
 *   id, effect without its decision) the transaction rolls back and no half-written
 *   pair exists. Only receipts live here: the per-run HMAC secret is never persisted,
 *   so reading the database file does not let a Worker forge a receipt
 *   (tool-system.md §10, verification-plane.md §2).
 *
 * Exports: createSqliteReceiptLog().
 * Depends on: @forge/tools, @forge/core, adapters/sqlite/receipt-rows, types/mutex.types,
 *   types/storage-driver.types.
 */

import { InvalidInputError } from '@forge/core';
import { Receipt } from '@forge/tools';
import type { ChainView, DecisionReceipt, ReceiptLog } from '@forge/tools';
import { runImmediate } from '#/adapters/sqlite/immediate-tx.js';
import {
  DECISION_COLUMNS,
  EFFECT_COLUMNS,
  decisionFromRow,
  effectFromRow,
  insertReceipt,
} from '#/adapters/sqlite/receipt-rows.js';
import type { Mutex } from '#/types/mutex.types.js';
import type { SqlDriver, SqlRow } from '#/types/storage-driver.types.js';

const OPEN_DECISION =
  'FROM tool_decisions d WHERE d.run_id = ? AND NOT EXISTS (SELECT 1 FROM tool_effects e WHERE e.decision_id = d.id)';

/** Current end of the run's chain: its length (positions are 1..n) and last receipt. */
function chainHead(
  driver: SqlDriver,
  runId: string,
): { head: number; last: Receipt | null } {
  const row = driver.get<{ head: number | null }>(
    `SELECT MAX(m) AS head FROM (
       SELECT MAX(chain_seq) AS m FROM tool_decisions WHERE run_id = ?
       UNION ALL
       SELECT MAX(chain_seq) AS m FROM tool_effects WHERE run_id = ?)`,
    [runId, runId],
  );

  const head = row?.head ?? 0;
  if (head === 0) {
    return { head, last: null };
  }

  const d = driver.get(
    `SELECT ${DECISION_COLUMNS} FROM tool_decisions WHERE run_id = ? AND chain_seq = ?`,
    [runId, head],
  );

  if (d) {
    return { head, last: decisionFromRow(d) };
  }

  const e = driver.get(
    `SELECT ${EFFECT_COLUMNS} FROM tool_effects WHERE run_id = ? AND chain_seq = ?`,
    [runId, head],
  );

  return { head, last: e ? effectFromRow(e) : null };
}

function viewOf(driver: SqlDriver, runId: string, last: Receipt | null): ChainView {
  const seq = driver.get<{ s: number }>(
    'SELECT COALESCE(MAX(seq), 0) AS s FROM tool_decisions WHERE run_id = ?',
    [runId],
  );

  const decision = (row: SqlRow | undefined): DecisionReceipt | null =>
    row ? decisionFromRow(row) : null;

  return {
    last,
    lastSeq: seq?.s ?? 0,
    openDecision: (id) =>
      decision(
        driver.get(`SELECT ${DECISION_COLUMNS} ${OPEN_DECISION} AND d.id = ?`, [
          runId,
          id,
        ]),
      ),
    latestOpenDecision: (tool) =>
      decision(
        driver.get(
          `SELECT ${DECISION_COLUMNS} ${OPEN_DECISION} AND d.tool = ? ORDER BY d.chain_seq DESC, d.seq DESC LIMIT 1`,
          [runId, tool],
        ),
      ),
  };
}

/** Throws unless `r` may be stored in `runId`'s chain given what is already stored. */
function assertBelongs(driver: SqlDriver, runId: string, r: Receipt): void {
  if (r.kind === 'decision') {
    if (r.run_id !== runId) {
      throw new InvalidInputError(
        `receipt ${r.id} belongs to run ${r.run_id}, not ${runId}`,
      );
    }

    return;
  }

  const known = driver.get('SELECT 1 FROM tool_decisions WHERE id = ? AND run_id = ?', [
    r.decision_id,
    runId,
  ]);

  if (!known) {
    throw new InvalidInputError(
      `effect receipt has no decision ${r.decision_id} in run ${runId}`,
    );
  }
}

/**
 * Receipt log over `driver`. `mutex` must be the one the `StorageAdapter` on the same
 * connection uses, so receipt appends and storage transactions never interleave.
 */
export function createSqliteReceiptLog(driver: SqlDriver, mutex: Mutex): ReceiptLog {
  return {
    append: (runId, build) =>
      mutex.run(() =>
        runImmediate(driver, async () => {
          const { head, last } = chainHead(driver, runId);
          const built = build(viewOf(driver, runId, last)).map((r) => Receipt.parse(r));
          let position = head;
          for (const r of built) {
            assertBelongs(driver, runId, r);
            insertReceipt(driver, runId, ++position, r);
          }

          return built;
        }),
      ),

    // Queued on the mutex so a read never sees another transaction's uncommitted rows.
    list: (runId) =>
      mutex.run(async () => {
        const decisions = driver
          .all(
            `SELECT ${DECISION_COLUMNS} FROM tool_decisions WHERE run_id = ? AND chain_seq > 0`,
            [runId],
          )
          .map((row) => ({ at: Number(row['chain_seq']), r: decisionFromRow(row) }));

        const effects = driver
          .all(
            `SELECT ${EFFECT_COLUMNS} FROM tool_effects WHERE run_id = ? AND chain_seq > 0`,
            [runId],
          )
          .map((row) => ({ at: Number(row['chain_seq']), r: effectFromRow(row) }));

        return [...decisions, ...effects].sort((a, b) => a.at - b.at).map((x) => x.r);
      }),
  };
}
