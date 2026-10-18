/**
 * OutsideFacts: the facts from outside the project that a plan rests on, with their status.
 *
 * Why: a plan may be built on something the Director read on the web ("the API allows 100
 *   requests a minute"). The engine marks each such claim Supported (backed by at least one
 *   verified quote) or Unverified (nothing checked it), and one unverified claim is enough to
 *   stop the Director approving the plan alone. The owner deciding on the plan needs those
 *   claims next to the rest of its verification, with the evidence references linking to the
 *   Evidence tab, and a plain line saying why approval is theirs when any claim is unverified.
 *   Claim text is model output and is shown as text.
 *
 * Exports: OutsideFacts.
 * Depends on: react-router, lucide-react, domain/card-paths, domain/research-copy,
 *   domain/research-evidence, schemas/plan (type).
 */

import { ShieldCheck, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { cardPath } from '#/domain/card-paths.js';
import { outsideFactsBanner } from '#/domain/research-copy.js';
import { evidenceAnchor } from '#/domain/research-evidence.js';
import type { PlanVerification } from '#/schemas/plan.js';

export function OutsideFacts(props: {
  slug: string;
  cardId: string;
  claims: PlanVerification['outside_claims'];
}) {
  const { claims } = props;

  if (claims.length === 0) {
    return <p className="text-sm text-muted">None.</p>;
  }

  const banner = outsideFactsBanner(
    claims.filter((c) => c.status === 'unverified').length,
  );

  return (
    <div className="grid gap-2">
      {banner === null ? null : (
        <p role="status" className="rounded-lg bg-attn-soft px-3 py-2 text-sm font-medium">
          {banner}
        </p>
      )}
      <ul aria-label="Outside facts" className="grid gap-2">
        {claims.map((c, index) => {
          const ok = c.status === 'supported';
          const Icon = ok ? ShieldCheck : TriangleAlert;

          return (
            <li key={`${index}-${c.claim}`} className="grid gap-1 text-sm">
              <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <span className="inline-flex items-center gap-1 text-xs font-medium">
                  <Icon
                    aria-hidden="true"
                    className={`size-3.5 ${ok ? 'text-good' : 'text-attn'}`}
                  />
                  {ok ? 'Supported' : 'Unverified'}
                </span>
                <span className="min-w-0 break-words">{c.claim}</span>
              </p>
              {c.evidence.length === 0 ? (
                <p className="text-xs text-muted">No evidence is cited for this claim.</p>
              ) : (
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                  Evidence:
                  {c.evidence.map((ref) => (
                    <Link
                      key={ref}
                      to={`${cardPath(props.slug, props.cardId, 'evidence')}#${evidenceAnchor(ref)}`}
                      className="font-data text-signal underline"
                    >
                      {ref}
                    </Link>
                  ))}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
