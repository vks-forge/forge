/**
 * ClaimCard: one outside fact, whether it was checked, and the pages behind it.
 *
 * Why: this is the unit the owner judges. It shows the claim as text, a Verified or
 *   Unverified chip (an unverified one says why in words), and each page it came from as
 *   domain, title and when it was read. A source expands to the exact quote the engine found
 *   on that page, and "Open source" opens the whole stored page beside the list with that
 *   quote marked. Claim, title and quote are written by or copied from strangers, so all of
 *   it is plain text. The card carries its `E` reference as its id so the Plan tab can link
 *   straight to it.
 *
 * Exports: ClaimCard.
 * Depends on: react, lucide-react, components/research/evidence-chip, domain/format-time,
 *   domain/research-evidence, @forge/core (types).
 */

import { ChevronRight } from 'lucide-react';
import { useId, useState } from 'react';
import type { EvidenceView } from '@forge/core';
import { EvidenceChip } from '#/components/research/evidence-chip.js';
import { formatWhen } from '#/domain/format-time.js';
import { claimReason, domainOf, evidenceAnchor } from '#/domain/research-evidence.js';

function SourceRow(props: {
  claim: EvidenceView;
  source: EvidenceView['source_list'][number];
  onOpen: (ref: string, quote: string | undefined) => void;
}) {
  const { claim, source } = props;
  const [open, setOpen] = useState(false);
  const panel = useId();
  const quotes = claim.quotes.filter((q) => q.source === source.ref);
  const title = source.title === '' ? domainOf(source.final_url) : source.title;

  return (
    <li className="grid gap-1.5 border-t border-line pt-2 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="font-data text-xs text-muted">{source.ref}</span>
        <span className="min-w-0 break-words font-medium">
          {domainOf(source.final_url)}
        </span>
        <span className="min-w-0 break-words text-muted">{title}</span>
        <time dateTime={source.retrieved_at} className="text-xs text-muted">
          read {formatWhen(source.retrieved_at)}
        </time>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panel}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex min-h-9 items-center gap-0.5 rounded-md px-1 text-xs font-medium text-signal hover:bg-hover"
        >
          <ChevronRight
            aria-hidden="true"
            className={`size-3.5 transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
          />
          {quotes.length === 0 ? 'Why no quote' : 'Show the quote'}
        </button>
        <button
          type="button"
          aria-label={`Open source ${source.ref}: ${title}`}
          onClick={() => props.onOpen(source.ref, quotes[0]?.quote)}
          className="inline-flex min-h-9 items-center rounded-md px-1 text-xs font-medium text-signal hover:bg-hover"
        >
          Open source
        </button>
      </div>
      {open ? (
        <div id={panel} className="grid gap-1.5">
          {quotes.length === 0 ? (
            <p className="text-xs text-muted">
              Nothing the Director quoted from this page was found on it, so the claim
              could not be checked against it.
            </p>
          ) : (
            quotes.map((q) => (
              <blockquote
                key={q.quote}
                className="min-w-0 break-words border-l-2 border-line pl-3 text-xs"
              >
                {q.quote}
              </blockquote>
            ))
          )}
        </div>
      ) : null}
    </li>
  );
}

export function ClaimCard(props: {
  claim: EvidenceView;
  onOpen: (ref: string, quote: string | undefined) => void;
}) {
  const { claim } = props;
  const reason = claimReason(claim);

  return (
    <li
      id={evidenceAnchor(claim.ref)}
      className="grid scroll-mt-4 gap-3 rounded-xl border border-line bg-surface p-4"
    >
      <div className="flex flex-wrap items-start gap-2">
        <span className="font-data text-xs text-muted">{claim.ref}</span>
        <EvidenceChip status={claim.status} />
        {reason === null ? null : <span className="text-xs text-muted">{reason}</span>}
      </div>
      <p className="min-w-0 break-words text-sm">{claim.claim}</p>
      {claim.source_list.length === 0 ? (
        <p className="text-xs text-muted">No page is attached to this claim.</p>
      ) : (
        <ul aria-label={`Sources for ${claim.ref}`} className="grid gap-2">
          {claim.source_list.map((source) => (
            <SourceRow
              key={source.ref}
              claim={claim}
              source={source}
              onOpen={props.onOpen}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
