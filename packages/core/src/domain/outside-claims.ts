/**
 * Outside claims — marking what the plan rests on as supported or unverified.
 *
 * Why: a plan may rest on facts from outside the repository. The model that wrote the plan names the
 *   evidence it relies on, but only the engine knows whether that evidence exists and was verified
 *   against a fetched page. A claim is `supported` only when it cites at least one ref and every ref is
 *   a verified evidence row of the card; anything else stays `unverified` and the approval floor sends
 *   the plan to the owner.
 *
 * Exports: markOutsideClaims().
 * Depends on: schemas/plan, schemas/research. No IO.
 */

import type { PlanVerification } from '#/schemas/plan.js';
import type { EvidenceRef, EvidenceStatus } from '#/schemas/research.js';

/** Each claim with the engine's verdict on its evidence refs. */
export function markOutsideClaims(
  claims: readonly { claim: string; evidence: readonly EvidenceRef[] }[],
  evidence: readonly { ref: string; status: EvidenceStatus }[],
): PlanVerification['outside_claims'] {
  const status = new Map(evidence.map((e) => [e.ref, e.status]));

  return claims.map((c) => ({
    claim: c.claim,
    evidence: [...c.evidence],
    status:
      c.evidence.length > 0 && c.evidence.every((ref) => status.get(ref) === 'verified')
        ? 'supported'
        : 'unverified',
  }));
}
