/**
 * EvidenceChip: says whether a claim was checked against its page, in a word and a shape.
 *
 * Why: a plan may rest on facts from the web, and "checked" must never be a colour alone. A
 *   Verified claim has a quote the engine found on the stored page; an Unverified one has not,
 *   so the owner has to decide whether to trust it. Amber is the app's "needs you" colour,
 *   which is right for an unverified claim that blocks automatic approval; Verified stays
 *   neutral with a check, since it asks nothing of anyone.
 *
 * Exports: EvidenceChip.
 * Depends on: lucide-react.
 */

import { ShieldCheck, TriangleAlert } from 'lucide-react';

export function EvidenceChip(props: { status: string }) {
  const verified = props.status === 'verified';
  const Icon = verified ? ShieldCheck : TriangleAlert;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${
        verified ? 'bg-hover text-fg' : 'bg-attn-soft text-fg'
      }`}
    >
      <Icon
        aria-hidden="true"
        className={`size-3.5 ${verified ? 'text-good' : 'text-attn'}`}
      />
      {verified ? 'Verified' : 'Unverified'}
    </span>
  );
}
