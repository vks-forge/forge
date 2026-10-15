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
 *   A run that survives a server restart continues under a new secret (d-0092, d-0100), so
 *   its chain has one segment per generation, joined by a `resumed` receipt that links to the
 *   last receipt of the segment before it and is signed with the new generation's secret.
 *   `verifyGenerations` (receipt-verify.ts) checks each segment under its own generation's secret
 *   and the links between them; a missing secret is a failure, never a pass.
 *
 * Exports: makeDecisionReceipt(), makeEffectReceipt(), makeResumedReceipt(). Verification is in
 *   `receipt-verify.ts`, the shared MAC in `receipt-mac.ts`.
 * Depends on: schemas/receipt, domain/receipt-mac, types/receipts. No IO.
 */

import {
  decisionBody,
  effectBody,
  link,
  mac,
  resumedBody,
} from '#/domain/receipt-mac.js';
import type {
  DecisionReceipt,
  EffectReceipt,
  Receipt,
  ResumedReceipt,
} from '#/schemas/receipt.js';
import { sha256Hex } from '#/shared/hmac.js';
import type {
  DecisionReceiptInput,
  EffectReceiptInput,
  HmacKey,
  ResumedReceiptInput,
} from '#/types/receipts.types.js';

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
 * The receipt that starts secret generation `input.generation`, chained after `prev` (the
 * last receipt of the generation before, or `null` when it wrote none) and signed with the
 * NEW generation's secret.
 */
export function makeResumedReceipt(
  input: ResumedReceiptInput,
  prev: Receipt | null,
  newSecret: HmacKey,
): ResumedReceipt {
  const row: Omit<ResumedReceipt, 'hash'> = {
    kind: 'resumed',
    run_id: input.run_id,
    generation: input.generation,
    ts: input.ts,
    prev_hash: link(prev),
  };

  return {
    ...row,
    hash: mac(
      newSecret,
      row.prev_hash,
      row.generation,
      'resumed',
      sha256Hex(row.run_id),
      resumedBody(row),
    ),
  };
}
