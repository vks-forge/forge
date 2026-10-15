/**
 * Starts a new secret generation of a run's receipt chain.
 *
 * Why: when a run resumes after a restart it signs under a new secret (d-0100), and gate G1
 *   verifies each generation's segment with that generation's secret. The chain must say
 *   where one segment ends and the next begins, or a cut-out stretch of receipts between two
 *   segments would go unnoticed. This appends the `resumed` receipt: it links to the last
 *   receipt of the earlier generation and is signed with the new secret, so the new process
 *   can neither extend nor rewrite the earlier segment and cannot pass as the old one. The
 *   hook handler's next receipt chains from it.
 *
 * Exports: linkResumedGeneration().
 * Depends on: @forge/tools (makeResumedReceipt, ReceiptLog, HmacKey). IO only through the ReceiptLog.
 */

import { makeResumedReceipt } from '@forge/tools';
import type { HmacKey, ReceiptLog, ResumedReceipt } from '@forge/tools';

/**
 * Appends the `resumed` receipt for `generation` (the chain must be in `generation - 1`) and
 * returns it. Throws, writing nothing, when the chain is in any other generation.
 */
export async function linkResumedGeneration(
  receipts: ReceiptLog,
  runId: string,
  generation: number,
  secret: HmacKey,
  ts: string,
): Promise<ResumedReceipt> {
  const [written] = await receipts.append(runId, (view) => [
    makeResumedReceipt({ run_id: runId, generation, ts }, view.last, secret),
  ]);

  return written as ResumedReceipt;
}
