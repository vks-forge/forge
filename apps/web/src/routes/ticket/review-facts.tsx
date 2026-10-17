/**
 * ReviewFacts: what the owner is about to merge, shown above Approve and Sign off.
 *
 * Why: merging is the one step Forge cannot take back, so approving needs more than a button. The
 *   panel shows the size of the change (files, lines added and removed, read from the worktree),
 *   the commit the gates judged, the G1 report and the pull request, so the owner can open them
 *   before deciding. Each fact is shown only when the server has it: a missing diff (the worktree
 *   is gone) never hides the rest. A ticket that is not in review or sign-off draws nothing.
 *
 * Exports: ReviewFacts.
 * Depends on: lucide-react, schemas/tickets (type), routes/ticket/ticket-side (latestGates).
 */

import { ExternalLink, FileDiff } from 'lucide-react';
import { latestGates } from '#/routes/ticket/ticket-side.js';
import type { TicketDetail } from '#/schemas/tickets.js';

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

export function ReviewFacts(props: { detail: TicketDetail }) {
  const { ticket, review, gate_results: gates } = props.detail;
  if (ticket.status !== 'review' && ticket.status !== 'needs_signoff') {
    return null;
  }

  const g1 = latestGates(gates).find((g) => g.gate === 'G1');

  return (
    <dl
      aria-label="What will be merged"
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 text-sm"
    >
      {review === null ? null : (
        <div className="flex flex-wrap items-center gap-x-2">
          <dt className="flex items-center gap-1 font-medium">
            <FileDiff aria-hidden="true" className="size-4 text-muted" />
            Change
          </dt>
          <dd>
            {plural(review.files.length, 'file')},{' '}
            <span className="font-data text-good">+{review.additions}</span>{' '}
            <span className="font-data text-danger">−{review.deletions}</span>
          </dd>
        </div>
      )}
      {review?.head_sha === undefined ? null : (
        <div className="flex flex-wrap items-center gap-x-2">
          <dt className="font-medium">Checked commit</dt>
          <dd className="font-data text-xs">{review.head_sha.slice(0, 12)}</dd>
        </div>
      )}
      {g1?.report_ref === undefined ? null : (
        <div className="flex flex-wrap items-center gap-x-2">
          <dt className="font-medium">G1 report</dt>
          <dd className="min-w-0 max-w-full font-data text-xs [overflow-wrap:anywhere]">
            {g1.report_ref}
          </dd>
        </div>
      )}
      {ticket.pr_url === undefined ? null : (
        <div className="flex flex-wrap items-center gap-x-2">
          <dt className="font-medium">Pull request</dt>
          <dd>
            <a
              href={ticket.pr_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-signal underline"
            >
              {ticket.pr_number === undefined ? 'Open it' : `#${ticket.pr_number}`}
              <ExternalLink aria-hidden="true" className="size-3.5" />
            </a>
          </dd>
        </div>
      )}
    </dl>
  );
}
