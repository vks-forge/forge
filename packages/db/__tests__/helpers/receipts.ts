/**
 * Receipt builders for @forge/db tests: real HMAC-chained receipts, as the hook writes them.
 *
 * Why: the receipt log must be tested with the receipts the hook handler really builds
 *   (made by `makeDecisionReceipt` / `makeEffectReceipt` from @forge/tools) so that
 *   `verifyChain` over what storage returns proves nothing was altered, reordered or
 *   dropped on the way through the database. Hand-rolled rows would pass while a real
 *   chain broke.
 *
 * Exports: RECEIPT_SECRET, appendDecision(), appendEffect().
 * Depends on: @forge/tools. No IO.
 */

import type { Decision, Receipt } from '@forge/tools';
import { makeDecisionReceipt, makeEffectReceipt } from '@forge/tools';
import type { ReceiptLog } from '@forge/tools';
import { T0 } from '#tests/helpers/fixtures.js';

export const RECEIPT_SECRET = 'run-secret-for-tests';

const DECISION: Decision = {
  decision: 'allow',
  reason: 'rule_allow',
  enforced_by: 'forge_admit',
  enforcement: 'hook',
  layer: 'rule',
  matched_rule: 'lane:standard#4',
  finding_ids: ['f-1', 'f-2'],
  tool: 'shell',
};

/** Appends one decision receipt with `seq` taken from the chain tail, as the hook does. */
export function appendDecision(
  log: ReceiptLog,
  runId: string,
  id: string,
  decision: Decision = DECISION,
): Promise<readonly Receipt[]> {
  return log.append(runId, (view) => [
    makeDecisionReceipt(
      {
        id,
        run_id: runId,
        seq: view.lastSeq + 1,
        decision,
        version: '1',
        schema_hash: `sha256:${'c'.repeat(64)}`,
        args_hash: 'a'.repeat(64),
        approver: 'auto',
        approval_ref: 'appr-1',
        ts: T0,
      },
      view.last,
      RECEIPT_SECRET,
    ),
  ]);
}

/** Appends the effect receipt closing decision `decisionId`. */
export function appendEffect(
  log: ReceiptLog,
  runId: string,
  decisionId: string,
): Promise<readonly Receipt[]> {
  return log.append(runId, (view) => {
    const d = view.openDecision(decisionId);
    if (!d) throw new Error(`no open decision ${decisionId}`);
    return [
      makeEffectReceipt(
        d,
        {
          state: 'mutation_committed',
          result_hash: 'b'.repeat(64),
          result_ref: 'ref-1',
          duration_ms: 12,
          cost_usd: 0.25,
          checkpoint_ref: 'cp-1',
          ts: T0,
        },
        view.last,
        RECEIPT_SECRET,
      ),
    ];
  });
}
