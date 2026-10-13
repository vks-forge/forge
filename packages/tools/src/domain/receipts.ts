/**
 * Hash-chained decision and effect receipts, and their verifier.
 *
 * Why: the independent gates and the Ticket screen must be able to prove what a Worker
 *   was allowed to do and what it actually did, without trusting the Worker or the
 *   harness. Each receipt is HMAC'd under a per-run secret the harness never sees and
 *   links to the previous receipt's hash, so editing a field, deleting a row, reordering
 *   or splicing in a forged one makes `verifyChain` fail at a named index. The MAC covers
 *   `prev_hash || seq || tool || input_hash || output_hash`, where `output_hash` digests
 *   every remaining field, so no column can change unnoticed (tool-system.md §10,
 *   verification-plane.md §2).
 *
 *   An effect is only meaningful for a call that was allowed, and once: a second effect or
 *   an effect on a denied decision is how a forged "it ran" would be slipped into a chain,
 *   so the verifier rejects both.
 *
 * Exports: makeDecisionReceipt(), makeEffectReceipt(), verifyChain().
 * Depends on: @forge/core (Result), schemas/receipt, shared/canonical-json, shared/hmac, types/receipts. No IO.
 */

import { err, ok } from '@forge/core';
import type { Result } from '@forge/core';
import { Receipt } from '#/schemas/receipt.js';
import type { DecisionReceipt, EffectReceipt } from '#/schemas/receipt.js';
import { canonicalJson } from '#/shared/canonical-json.js';
import { hmacHex, constantTimeEqual, sha256Hex } from '#/shared/hmac.js';
import type {
  ChainFailure,
  DecisionReceiptInput,
  EffectReceiptInput,
  HmacKey,
} from '#/types/receipts.types.js';

function mac(
  key: HmacKey,
  prev: string | null,
  seq: number,
  tool: string,
  inputHash: string,
  body: unknown,
): string {
  const outputHash = sha256Hex(canonicalJson(body));
  return hmacHex(key, canonicalJson([prev, seq, tool, inputHash, outputHash]));
}

/** Every decision column not already in the MAC preimage; digested into `output_hash`. */
function decisionBody(r: Omit<DecisionReceipt, 'hash'>): unknown {
  return [
    r.kind,
    r.id,
    r.run_id,
    r.version,
    r.schema_hash,
    r.decision,
    r.layer,
    r.reason,
    r.rule_id,
    r.resource,
    r.finding_ids,
    r.approver,
    r.approval_ref,
    r.enforced_by,
    r.ts,
  ];
}

/** Every effect column not already in the MAC preimage. */
function effectBody(r: Omit<EffectReceipt, 'hash'>): unknown {
  return [
    r.kind,
    r.decision_id,
    r.state,
    r.result_hash,
    r.result_ref,
    r.duration_ms,
    r.cost_usd,
    r.checkpoint_ref,
    r.ts,
  ];
}

const link = (prev: Receipt | null): string | null => prev?.hash ?? null;

/** Builds the next decision receipt after `prev` (or the first, with `null`). */
export function makeDecisionReceipt(
  input: DecisionReceiptInput,
  prev: Receipt | null,
  runSecret: HmacKey,
): DecisionReceipt {
  const d = input.decision;
  const row: Omit<DecisionReceipt, 'hash'> = {
    kind: 'decision',
    id: input.id,
    run_id: input.run_id,
    seq: input.seq,
    tool: d.tool,
    version: input.version ?? null,
    schema_hash: input.schema_hash ?? null,
    args_hash: input.args_hash,
    decision: d.decision,
    layer: d.layer,
    reason: d.reason,
    rule_id: d.matched_rule,
    resource: input.resource ?? null,
    finding_ids: [...d.finding_ids],
    approver: input.approver ?? null,
    approval_ref: input.approval_ref ?? null,
    enforced_by: d.enforcement,
    ts: input.ts,
    prev_hash: link(prev),
  };
  return {
    ...row,
    hash: mac(
      runSecret,
      row.prev_hash,
      row.seq,
      row.tool,
      row.args_hash,
      decisionBody(row),
    ),
  };
}

/** Builds the effect receipt for `decision`, chained after `prev`. */
export function makeEffectReceipt(
  decision: DecisionReceipt,
  input: EffectReceiptInput,
  prev: Receipt | null,
  runSecret: HmacKey,
): EffectReceipt {
  const row: Omit<EffectReceipt, 'hash'> = {
    kind: 'effect',
    decision_id: decision.id,
    state: input.state,
    result_hash: input.result_hash ?? null,
    result_ref: input.result_ref ?? null,
    duration_ms: input.duration_ms ?? null,
    cost_usd: input.cost_usd ?? null,
    checkpoint_ref: input.checkpoint_ref ?? null,
    ts: input.ts,
    prev_hash: link(prev),
  };
  const h = mac(
    runSecret,
    row.prev_hash,
    decision.seq,
    decision.tool,
    decision.args_hash,
    effectBody(row),
  );
  return { ...row, hash: h };
}

/**
 * Verifies receipts given in append order. Returns the count on success or the first
 * broken index and why. Truncating the tail is not detectable from the chain alone; the
 * run record's final receipt hash covers that.
 */
export function verifyChain(
  rows: readonly unknown[],
  runSecret: HmacKey,
): Result<number, ChainFailure> {
  const decisions = new Map<string, DecisionReceipt>();
  const closed = new Set<string>();
  let prev: string | null = null;
  let lastSeq: number | null = null;
  for (const [index, raw] of rows.entries()) {
    const parsed = Receipt.safeParse(raw);
    if (!parsed.success) return err({ index, reason: 'bad_schema' });
    const r = parsed.data;
    if (r.prev_hash !== prev) return err({ index, reason: 'prev_hash' });
    let expected: string;
    if (r.kind === 'decision') {
      if (decisions.has(r.id)) return err({ index, reason: 'duplicate_decision' });
      if (lastSeq !== null && r.seq !== lastSeq + 1) return err({ index, reason: 'seq' });
      lastSeq = r.seq;
      decisions.set(r.id, r);
      expected = mac(runSecret, r.prev_hash, r.seq, r.tool, r.args_hash, decisionBody(r));
    } else {
      const d = decisions.get(r.decision_id);
      if (!d) return err({ index, reason: 'orphan_effect' });
      // One effect per decision, and only for a call that was allowed to run.
      if (closed.has(d.id)) return err({ index, reason: 'duplicate_effect' });
      if (d.decision !== 'allow') return err({ index, reason: 'effect_not_allowed' });
      closed.add(d.id);
      expected = mac(runSecret, r.prev_hash, d.seq, d.tool, d.args_hash, effectBody(r));
    }
    if (!constantTimeEqual(expected, r.hash)) return err({ index, reason: 'hash' });
    prev = r.hash;
  }
  return ok(rows.length);
}
