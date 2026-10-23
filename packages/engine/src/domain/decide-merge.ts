/**
 * Merge decision: the one pure answer to "do the checks allow this ticket to merge?".
 *
 * Why: the verify phase (automatic merge) and the owner's "Approve and merge" both end at the merge
 *   door, and each used to read the gate rows in its own way. The owner can overrule a held G1
 *   (config_hold, "Merge anyway"), which marks the G1 stage row passed with their override while
 *   the gate row stays `failed`; a door that read only the rows refused that ticket for good
 *   (CHE-10). Here a failed gate counts as passed only when the G1 stage of the same run carries
 *   the owner's override, and the pass names what was overruled so the card can say so. A failed
 *   gate without override, a gate with no verdict, or a PR head that is not the commit the gates
 *   judged refuses (fail closed).
 *
 * Exports: decideMerge(), describeOverride().
 * Depends on: domain/gate-rows, types/merge-decision. No IO.
 */

import type { GateResult } from '@forge/core';
import { gatedHeadOf } from '#/domain/gate-rows.js';
import type {
  MergeDecision,
  MergeDecisionInput,
  OverriddenGate,
} from '#/types/merge-decision.types.js';

/** Decides whether the checks allow a merge; never throws. */
export function decideMerge(input: MergeDecisionInput): MergeDecision {
  const { rows, gates, stages, runId, targetHead } = input;
  const by = new Map<string, GateResult>(rows.map((r) => [r.gate, r]));

  // The owner's override of the G1 stage of this very run; an older run's override covers nothing.
  const override = stages
    .filter(
      (s) =>
        s.kind === 'script_gate' &&
        s.status === 'passed' &&
        s.run_id === runId &&
        s.outcome.override !== undefined,
    )
    .sort((a, b) => b.id - a.id)[0]?.outcome.override;

  const failed = gates.map((g) => g.name).filter((n) => by.get(n)?.status === 'failed');
  // A failed install means the project does not build at all; no override of G1 covers it.
  const setupFailed = by.get('setup')?.status === 'failed' ? ['setup'] : [];
  const unoverruled = [...setupFailed, ...(override === undefined ? failed : [])];
  if (unoverruled.length > 0) {
    return { kind: 'fail', reason: 'gate_failed', gates: unoverruled };
  }

  const missing = gates
    .map((g) => g.name)
    .filter((n) => {
      const s = by.get(n)?.status;

      return s !== 'passed' && s !== 'skipped' && s !== 'failed';
    });

  if (missing.length > 0) {
    return { kind: 'fail', reason: 'gate_missing', gates: missing };
  }

  if (targetHead !== undefined) {
    const gated = gatedHeadOf(rows);
    if (gated === undefined || gated !== targetHead) {
      return { kind: 'fail', reason: 'head_moved', gates: [] };
    }
  }

  const overridden: OverriddenGate[] =
    override === undefined ? [] : failed.map((gate) => ({ gate, ...override }));

  return { kind: 'pass', overridden };
}

/** One sentence for the card: who overruled which checks and why; empty when nothing was overruled. */
export function describeOverride(decision: MergeDecision): string {
  if (decision.kind !== 'pass' || decision.overridden.length === 0) {
    return '';
  }

  const [first] = decision.overridden;
  const gates = decision.overridden.map((o) => o.gate).join(', ');

  return `Merged over failed check ${gates}, which the ${first?.by} overruled on ${first?.at}: "${first?.comment}".`;
}
