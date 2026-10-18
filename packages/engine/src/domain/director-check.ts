/**
 * Director check — what the check against the plan is shown, and how its answer becomes findings.
 *
 * Why: the Director's check exists to be independent of the Worker (d-0141 item 9). The step is
 *   shown typed artifacts only (the ticket, the plan entry with its acceptance and files, the
 *   diff, the gate and test reports, earlier findings); the Worker's own account and its
 *   self-reported claims are never inputs, even if a caller passes them, so a confident story
 *   cannot talk the check into agreeing. The answer is not taken at its word either: an unmet
 *   criterion becomes a high finding and an unclear one a medium finding, so a check that cannot
 *   tell can still block under the stage's policy; and a claim that the work is out of plan,
 *   when not one changed file lies outside the plan's list, is not trusted as scope drift but
 *   fails closed as a blocking finding the owner decides on. Which files are unplanned is
 *   computed by the engine from the diff and never asked of the model.
 *
 * Exports: CHECK_ARTIFACT_KINDS, buildCheckInput(), synthesizeReview().
 * Depends on: @forge/core (TicketCheckInput, TicketCheckOutput), types/director-check. No IO.
 */

import type {
  ArtifactKind,
  Finding,
  TicketCheckInput,
  TicketCheckOutput,
} from '@forge/core';
import type { CheckInputParts, SynthesizedCheck } from '#/types/director-check.types.js';

/** The artifact kinds the Director check may read: typed ones only; narrative and finish_claims are the Worker's own words. */
export const CHECK_ARTIFACT_KINDS: readonly ArtifactKind[] = [
  'ticket',
  'plan',
  'diff',
  'gate_report',
  'test_report',
  'findings',
];

/** The step input: the allowed artifacts in the order given, the unplanned files and the method text. */
export function buildCheckInput(parts: CheckInputParts): TicketCheckInput {
  return {
    artifacts: parts.artifacts
      .filter((a) => CHECK_ARTIFACT_KINDS.includes(a.kind))
      .map((a) => ({ kind: a.kind, content: a.content, truncated: a.truncated })),
    unplanned: [...parts.unplanned],
    playbook: parts.playbook,
    house_rules: parts.houseRules,
  };
}

const MAX_FINDINGS = 100;

/**
 * The review the engine records for a check answer. Acceptance verdicts become findings (`no` is
 * high, `unclear` medium) beside the model's own; `out_of_plan` with no unplanned file is a high
 * finding, never a pass.
 */
export function synthesizeReview(
  out: TicketCheckOutput,
  unplanned: readonly string[],
): SynthesizedCheck {
  const findings: Finding[] = [...out.findings];
  for (const a of out.acceptance) {
    if (a.met === 'no') {
      findings.push({
        severity: 'high',
        issue: `Acceptance criterion not met: ${a.criterion}`,
        evidence: a.evidence,
      });
    } else if (a.met === 'unclear') {
      findings.push({
        severity: 'medium',
        issue: `Acceptance criterion could not be confirmed: ${a.criterion}`,
        evidence: a.evidence,
      });
    }
  }

  const scopeDrift = out.verdict === 'out_of_plan' && unplanned.length > 0;
  if (out.verdict === 'out_of_plan' && unplanned.length === 0) {
    findings.push({
      severity: 'high',
      issue:
        'The check judged the change to be outside the plan but named no file outside it',
      evidence: out.summary,
    });
  }

  const blocking = findings.some(
    (f) => f.severity === 'critical' || f.severity === 'high',
  );

  return {
    review: {
      verdict: blocking || out.verdict !== 'pass' ? 'changes' : 'pass',
      summary: out.summary,
      findings: findings.slice(0, MAX_FINDINGS),
    },
    scopeDrift,
  };
}
