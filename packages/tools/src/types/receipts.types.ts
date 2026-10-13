/**
 * Types for building and verifying the receipt chain.
 *
 * Why: receipt rows are written by the dispatcher while the Worker runs, and checked
 *   later by the gates. The input shapes name exactly what the writer must supply (the
 *   chain fields and hashes are computed, never supplied), so a caller cannot forge or
 *   skip a link, and the verifier can say precisely which row broke
 *   (tool-system.md §10).
 *
 * Exports: DecisionReceiptInput, EffectReceiptInput, ChainFailure, HmacKey.
 * Depends on: schemas/receipt, schemas/decision, schemas/tool-definition. No IO.
 */

import type { Decision } from '#/schemas/decision.js';
import type { EffectReceipt } from '#/schemas/receipt.js';

export interface DecisionReceiptInput {
  readonly id: string;
  readonly run_id: string;
  readonly seq: number;
  readonly decision: Decision;
  readonly version?: string | null;
  readonly schema_hash?: string | null;
  /** SHA-256 hex of the canonical call arguments. */
  readonly args_hash: string;
  readonly approver?: 'auto' | 'user' | 'guardian' | null;
  readonly approval_ref?: string | null;
  readonly ts: string;
}

export interface EffectReceiptInput {
  readonly state: EffectReceipt['state'];
  readonly result_hash?: string | null;
  readonly result_ref?: string | null;
  readonly duration_ms?: number | null;
  readonly cost_usd?: number | null;
  readonly checkpoint_ref?: string | null;
  readonly ts: string;
}

/** Where and why `verifyChain` stopped. */
export interface ChainFailure {
  readonly index: number;
  readonly reason:
    | 'bad_schema'
    | 'prev_hash'
    | 'hash'
    | 'seq'
    | 'orphan_effect'
    | 'duplicate_decision'
    | 'duplicate_effect'
    | 'effect_not_allowed';
}

/** Run secret: a string or raw bytes. */
export type HmacKey = string | Uint8Array;
