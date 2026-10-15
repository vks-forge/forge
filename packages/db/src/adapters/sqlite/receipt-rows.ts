/**
 * Row mapping between tool receipts and the `tool_decisions` / `tool_effects` tables.
 *
 * Why: a receipt's HMAC covers every field, so a column that drops, rounds or reshapes a
 *   value on the way through the database makes an honest chain fail verification, and
 *   one that silently defaults makes a forged field invisible. Mapping each receipt
 *   field to its column, and back through the tools receipt schema, in one place keeps
 *   writes and reads symmetric: `finding_ids` is JSON text, `rule_id` is the matched
 *   rule, `resource` is what the call touched (NULL when none could be named),
 *   `parent_call_id` has no receipt field yet and stays NULL, and `chain_seq` is
 *   the position in the run's chain across the three tables (tool-system.md §10). A `resumed`
 *   receipt (the join between two run secret generations, d-0100) lives in `receipt_resumes`;
 *   decisions and effects also record the `generation` they were written in, which is storage
 *   metadata read from the chain position, not part of the MAC.
 *
 * Exports: insertReceipt(), decisionFromRow(), effectFromRow(), resumedFromRow(),
 *   DECISION_COLUMNS, EFFECT_COLUMNS, RESUMED_COLUMNS.
 * Depends on: @forge/tools (receipt schemas), shared/json, types/storage-driver.types.
 */

import { DecisionReceipt, EffectReceipt, ResumedReceipt } from '@forge/tools';
import type { Receipt } from '@forge/tools';
import { parseStored } from '#/shared/db-errors.js';
import { fromJson, toJson } from '#/shared/json.js';
import type { SqlDriver, SqlRow } from '#/types/storage-driver.types.js';

export const DECISION_COLUMNS =
  'id, run_id, seq, tool, version, schema_hash, args_hash, decision, layer, reason, rule_id, resource, finding_ids_json, approver, approval_ref, enforced_by, ts, prev_hash, hash, chain_seq';

export const EFFECT_COLUMNS =
  'decision_id, run_id, chain_seq, state, result_hash, result_ref, duration_ms, cost_usd, checkpoint_ref, ts, prev_hash, hash';

export const RESUMED_COLUMNS = 'run_id, generation, chain_seq, ts, prev_hash, hash';

/** Rebuilds (and re-validates) a decision receipt from a `tool_decisions` row. */
export function decisionFromRow(row: SqlRow): DecisionReceipt {
  return parseStored(
    DecisionReceipt,
    {
      kind: 'decision',
      id: row['id'],
      run_id: row['run_id'],
      seq: row['seq'],
      tool: row['tool'],
      version: row['version'],
      schema_hash: row['schema_hash'],
      args_hash: row['args_hash'],
      decision: row['decision'],
      layer: row['layer'],
      reason: row['reason'],
      rule_id: row['rule_id'],
      resource: row['resource'],
      finding_ids: fromJson(row['finding_ids_json']) ?? [],
      approver: row['approver'],
      approval_ref: row['approval_ref'],
      enforced_by: row['enforced_by'],
      ts: row['ts'],
      prev_hash: row['prev_hash'],
      hash: row['hash'],
    },
    'decision receipt',
  );
}

/** Rebuilds (and re-validates) an effect receipt from a `tool_effects` row. */
export function effectFromRow(row: SqlRow): EffectReceipt {
  return parseStored(
    EffectReceipt,
    {
      kind: 'effect',
      decision_id: row['decision_id'],
      state: row['state'],
      result_hash: row['result_hash'],
      result_ref: row['result_ref'],
      duration_ms: row['duration_ms'],
      cost_usd: row['cost_usd'],
      checkpoint_ref: row['checkpoint_ref'],
      ts: row['ts'],
      prev_hash: row['prev_hash'],
      hash: row['hash'],
    },
    'effect receipt',
  );
}

/** Rebuilds (and re-validates) a `resumed` receipt from a `receipt_resumes` row. */
export function resumedFromRow(row: SqlRow): ResumedReceipt {
  return parseStored(
    ResumedReceipt,
    {
      kind: 'resumed',
      run_id: row['run_id'],
      generation: row['generation'],
      ts: row['ts'],
      prev_hash: row['prev_hash'],
      hash: row['hash'],
    },
    'resumed receipt',
  );
}

/**
 * Inserts one receipt at chain position `chainSeq` for `runId`, written in secret
 * `generation`; throws on any constraint.
 */
export function insertReceipt(
  driver: SqlDriver,
  runId: string,
  chainSeq: number,
  generation: number,
  r: Receipt,
): void {
  if (r.kind === 'resumed') {
    driver.run(
      `INSERT INTO receipt_resumes (${RESUMED_COLUMNS}) VALUES (${placeholders(6)})`,
      [r.run_id, r.generation, chainSeq, r.ts, r.prev_hash, r.hash],
    );

    return;
  }

  if (r.kind === 'decision') {
    driver.run(
      `INSERT INTO tool_decisions (${DECISION_COLUMNS}, generation) VALUES (${placeholders(21)})`,
      [
        r.id,
        runId,
        r.seq,
        r.tool,
        r.version,
        r.schema_hash,
        r.args_hash,
        r.decision,
        r.layer,
        r.reason,
        r.rule_id,
        r.resource,
        toJson(r.finding_ids),
        r.approver,
        r.approval_ref,
        r.enforced_by,
        r.ts,
        r.prev_hash,
        r.hash,
        chainSeq,
        generation,
      ],
    );

    return;
  }

  driver.run(
    `INSERT INTO tool_effects (${EFFECT_COLUMNS}, generation) VALUES (${placeholders(13)})`,
    [
      r.decision_id,
      runId,
      chainSeq,
      r.state,
      r.result_hash,
      r.result_ref,
      r.duration_ms,
      r.cost_usd,
      r.checkpoint_ref,
      r.ts,
      r.prev_hash,
      r.hash,
      generation,
    ],
  );
}

const placeholders = (n: number): string =>
  Array.from({ length: n }, () => '?').join(', ');
