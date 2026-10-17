/**
 * Verifies the receipt chains of a ticket's earlier runs before they may back anything.
 *
 * Why: a rework run reuses the ticket's branch, so G1 leans on the receipts of the runs
 *   before it to prove the edits already in the branch. Those receipts are evidence only if
 *   they are intact: each earlier chain is re-verified with that run's own secrets, exactly
 *   like the gated run's. A chain that fails, or whose secret is gone (run secrets are
 *   retired once a ticket closes), is set aside with the reason, never trusted: an earlier
 *   run that cannot be proven covers no file and backs no claim (fail closed).
 *
 * Exports: verifyEarlierRuns().
 * Depends on: @forge/tools (verifyGenerations), domain/chain-check (recordedGenerations), types/check.types. No IO.
 */

import { verifyGenerations } from '@forge/tools';
import { recordedGenerations } from '#/domain/chain-check.js';
import type {
  EarlierRunEvidence,
  RawEarlierRun,
  UnverifiedEarlierRun,
} from '#/types/check.types.js';

function unverifiableReason(run: RawEarlierRun): string | null {
  for (let g = 1; g <= recordedGenerations(run.receipts); g++) {
    if (!run.secrets.has(g)) {
      return `its run secret of generation ${g} is gone, chain unverifiable`;
    }
  }

  try {
    const result = verifyGenerations(run.receipts, (g) => run.secrets.get(g) ?? null);

    return result.ok
      ? null
      : `receipt chain broken at index ${result.error.index}: ${result.error.reason}, unverifiable`;
  } catch (e) {
    return `receipt chain unverifiable: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** Splits earlier runs into those whose chain verifies and those set aside, with a reason. */
export function verifyEarlierRuns(runs: readonly RawEarlierRun[]): {
  verified: EarlierRunEvidence[];
  unverified: UnverifiedEarlierRun[];
} {
  const verified: EarlierRunEvidence[] = [];
  const unverified: UnverifiedEarlierRun[] = [];
  for (const run of runs) {
    if (run.receipts.length === 0) {
      continue;
    }

    const reason = unverifiableReason(run);
    if (reason === null) {
      verified.push({ runId: run.runId, receipts: run.receipts });
    } else {
      unverified.push({ runId: run.runId, reason });
    }
  }

  return { verified, unverified };
}
