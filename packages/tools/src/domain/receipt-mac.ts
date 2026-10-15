/**
 * The MAC every receipt kind is signed with, and the field lists it covers.
 *
 * Why: the receipt makers and the chain verifier must compute exactly the same MAC, or an
 *   honest chain fails verification and a forged one might pass. The MAC covers
 *   `prev_hash || seq || tool || input_hash || output_hash`, where `output_hash` digests every
 *   remaining field of the row, so no column can change unnoticed (tool-system.md §10). Keeping
 *   the preimage in one module is what makes "add a field to a receipt" a change in one place
 *   that both writing and verifying pick up together.
 *
 * Exports: mac(), decisionBody(), effectBody(), resumedBody(), link().
 * Depends on: schemas/receipt, shared/canonical-json, shared/hmac, types/receipts. No IO.
 */

import type {
  DecisionReceipt,
  EffectReceipt,
  Receipt,
  ResumedReceipt,
} from '#/schemas/receipt.js';
import { canonicalJson } from '#/shared/canonical-json.js';
import { hmacHex, sha256Hex } from '#/shared/hmac.js';
import type { HmacKey } from '#/types/receipts.types.js';

/** HMAC over the chain position and a digest of the row's remaining fields. */
export function mac(
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
export function decisionBody(r: Omit<DecisionReceipt, 'hash'>): unknown {
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
export function effectBody(r: Omit<EffectReceipt, 'hash'>): unknown {
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

/** Every resumed column not already in the MAC preimage. */
export function resumedBody(r: Omit<ResumedReceipt, 'hash'>): unknown {
  return [r.kind, r.run_id, r.generation, r.ts];
}

export const link = (prev: Receipt | null): string | null => prev?.hash ?? null;
