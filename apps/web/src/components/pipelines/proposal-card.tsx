/**
 * ProposalCard: one Director suggestion to change a project's lane, with what changes, why, and Accept / Reject.
 *
 * Why: after the Director made the same change on several tickets it asks, once, whether the
 *   project's lane should simply have it. The owner decides here, in the Inbox drawer and on the
 *   Pipelines tab, and needs three things in one place: the change in the lane (the list with its
 *   additions and removals marked), the evidence (up to three of the Director's own reasons, each
 *   linked to its ticket) and a way forward that cannot go wrong silently. If the lane was edited
 *   since the suggestion, the card says "The lane changed since; nothing was applied" and offers
 *   only Reject (to dismiss it); a refused accept or reject is explained in words and the card
 *   refetches. Accepting writes through the same checked door as the pipeline editor, and a success
 *   says so in a notice that outlives the card (which leaves the pending list once decided).
 *
 * Exports: ProposalCard.
 * Depends on: react, react-router, lucide-react, api/use-pipelines, api/use-proposals,
 *   components/pipelines/{lane-diff-list,proposal-dialogs}, components/settings/form-field,
 *   components/ui/button, domain/{lane-diff,proposal-copy,ticket-paths}, state/notify, @forge/core (types).
 */

import { useState } from 'react';
import { Link } from 'react-router';
import type { PipelineProposalView } from '@forge/core';
import { usePipelines } from '#/api/use-pipelines.js';
import { useAcceptProposal, useRejectProposal } from '#/api/use-proposals.js';
import { LaneDiffList } from '#/components/pipelines/lane-diff-list.js';
import {
  AcceptProposalDialog,
  RejectProposalDialog,
} from '#/components/pipelines/proposal-dialogs.js';
import { Notice } from '#/components/settings/form-field.js';
import { Button } from '#/components/ui/button.js';
import { laneDiff, laneDiffSummary } from '#/domain/lane-diff.js';
import {
  STALE_WORDS,
  describeProposalError,
  proposalCount,
  proposalHeadline,
} from '#/domain/proposal-copy.js';
import { ticketPath } from '#/domain/ticket-paths.js';
import { useNotify } from '#/state/notify/notify-context.js';

export function ProposalCard(props: {
  slug: string;
  proposal: PipelineProposalView;
  /** Hides the headline when the surrounding screen already shows it (the drawer title). */
  compact?: boolean;
}) {
  const { slug, proposal } = props;
  const lanes = usePipelines({ kind: 'project', slug });
  const notify = useNotify();
  const accept = useAcceptProposal(slug, () =>
    notify.success('The lane was changed', {
      description: `${proposalHeadline(proposal)}. New tickets follow it.`,
    }),
  );

  const reject = useRejectProposal(slug, () =>
    notify.success('Suggestion rejected', {
      description: 'The lane stays as it is.',
    }),
  );

  const [dialog, setDialog] = useState<'accept' | 'reject' | null>(null);
  const summary = laneDiffSummary(laneDiff(proposal.current, proposal.proposed));
  const busy = accept.isPending || reject.isPending;
  const error = accept.error ?? reject.error;
  const version = lanes.data?.version;

  return (
    <section
      aria-label={proposalHeadline(proposal)}
      className="grid gap-3 rounded-xl border border-line bg-surface p-4"
    >
      {props.compact ? null : (
        <h3 className="text-sm font-semibold">{proposalHeadline(proposal)}</h3>
      )}
      <p className="text-sm text-muted">{proposalCount(proposal)}</p>

      {proposal.stale ? (
        <Notice tone="warn" title={STALE_WORDS}>
          The lane was edited after the Director made this suggestion. Reject it to
          dismiss it; the Director starts counting again on the new list.
        </Notice>
      ) : (
        <div className="grid gap-1.5">
          <p className="text-xs font-medium text-muted">
            {`What changes${summary === null ? '' : `: ${summary}`}`}
          </p>
          <LaneDiffList
            label="Lane with the change"
            current={proposal.current}
            proposed={proposal.proposed}
          />
        </div>
      )}

      <div className="grid gap-1">
        <p className="text-xs font-medium text-muted">Why the Director made it</p>
        <ul aria-label="The Director’s reasons" className="grid gap-1 text-sm">
          {proposal.evidence.map((item) => (
            <li key={item.ticket_id} className="min-w-0 break-words">
              <Link
                to={ticketPath(slug, item.ticket_id)}
                className="font-data text-xs font-medium text-signal underline-offset-2 hover:underline"
              >
                {item.ticket_id}
              </Link>
              {`: ${item.reason}`}
            </li>
          ))}
        </ul>
      </div>

      {error ? (
        <Notice tone="error" title="Nothing was changed">
          {describeProposalError(error)}
        </Notice>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={proposal.stale || busy || version === undefined}
          status={accept.isPending ? 'loading' : 'idle'}
          onClick={() => {
            accept.reset();
            reject.reset();
            setDialog('accept');
          }}
        >
          Accept change
        </Button>
        <Button
          disabled={busy}
          status={reject.isPending ? 'loading' : 'idle'}
          onClick={() => {
            accept.reset();
            reject.reset();
            setDialog('reject');
          }}
        >
          Reject
        </Button>
      </div>

      <AcceptProposalDialog
        proposal={proposal}
        open={dialog === 'accept'}
        onOpenChange={(open) => setDialog(open ? 'accept' : null)}
        onConfirm={(reason) => {
          if (version !== undefined) {
            accept.mutate({ id: proposal.id, expected_version: version, reason });
          }
        }}
      />
      <RejectProposalDialog
        proposal={proposal}
        open={dialog === 'reject'}
        onOpenChange={(open) => setDialog(open ? 'reject' : null)}
        onConfirm={(reason) => reject.mutate({ id: proposal.id, reason })}
      />
    </section>
  );
}
