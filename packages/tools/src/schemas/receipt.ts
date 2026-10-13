/**
 * Receipt schemas — hash-chained decision and effect rows.
 *
 * Why: the independent gates must not trust a Worker's own account of what it did. Every
 *   tool call leaves two tamper-evident rows: what policy decided (`tool_decisions`) and
 *   what actually happened (`tool_effects`). Each row's `hash` is an HMAC under a run
 *   secret the harness never sees and links to the previous row, so editing, dropping or
 *   reordering any row is detectable. Field names mirror the db tables so rows persist
 *   without translation (tool-system.md §10, verification-plane.md §2).
 *
 * Exports: EffectState, DecisionReceipt, EffectReceipt, Receipt.
 * Depends on: schemas/decision, schemas/tool-definition, zod. No IO.
 */

import { z } from 'zod';
import { DecisionVerdict } from '#/schemas/decision.js';
import { Enforcement } from '#/schemas/tool-definition.js';

export const EffectState = z.enum([
  'not_started',
  'read_completed',
  'failed_no_effect',
  'mutation_committed',
  'uncertain',
]);
export type EffectState = z.infer<typeof EffectState>;

const Hex64 = z.string().regex(/^[0-9a-f]{64}$/);
const Ts = z.iso.datetime();

/**
 * `tool_decisions` row. `resource` is what the call touched, named by `callResource()`
 * (normalised path, first 200 chars of the shell text, host, or MCP tool id; `null` when
 * none could be named) and is covered by the MAC.
 */
export const DecisionReceipt = z.object({
  kind: z.literal('decision'),
  id: z.string().min(1),
  run_id: z.string().min(1),
  seq: z.number().int().positive(),
  tool: z.string().min(1),
  version: z.string().nullable(),
  schema_hash: z.string().nullable(),
  args_hash: Hex64,
  decision: DecisionVerdict,
  layer: z.string().min(1),
  reason: z.string().min(1),
  rule_id: z.string().nullable(),
  resource: z.string().nullable(),
  finding_ids: z.array(z.string()),
  approver: z.enum(['auto', 'user', 'guardian']).nullable(),
  approval_ref: z.string().nullable(),
  enforced_by: Enforcement.nullable(),
  ts: Ts,
  prev_hash: Hex64.nullable(),
  hash: Hex64,
});
export type DecisionReceipt = z.infer<typeof DecisionReceipt>;

/** `tool_effects` row. */
export const EffectReceipt = z.object({
  kind: z.literal('effect'),
  decision_id: z.string().min(1),
  state: EffectState,
  result_hash: Hex64.nullable(),
  result_ref: z.string().nullable(),
  duration_ms: z.number().int().nonnegative().nullable(),
  cost_usd: z.number().nonnegative().nullable(),
  checkpoint_ref: z.string().nullable(),
  ts: Ts,
  prev_hash: Hex64.nullable(),
  hash: Hex64,
});
export type EffectReceipt = z.infer<typeof EffectReceipt>;

export const Receipt = z.discriminatedUnion('kind', [DecisionReceipt, EffectReceipt]);
export type Receipt = z.infer<typeof Receipt>;
