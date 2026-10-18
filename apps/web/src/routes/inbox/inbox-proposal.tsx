/**
 * InboxProposal: the body of the drawer that opens from a "Pipeline change" Inbox row.
 *
 * Why: a Director suggestion to change a lane is an Inbox item with no ticket behind it, so the
 *   row cannot lead to a ticket page; the owner decides in a drawer (rows are fixed-height, so the
 *   change and its evidence cannot grow the row). The drawer finds the suggestion by the id in the
 *   item (`pipeline_proposal:<id>`) among the pending ones and draws the same card as the Pipelines
 *   tab. States: loading while it is read, an error with a retry, and "already decided" when it
 *   left the pending list (decided here, in the tab or by another window), with the way to the lane.
 *
 * Exports: InboxProposal.
 * Depends on: react-router, @forge/core, api/describe-error, api/use-proposals,
 *   components/pipelines/proposal-card, components/status/state-panel, domain/nav-entries.
 */

import { Link } from 'react-router';
import { parseInboxItemId } from '@forge/core';
import { describeError } from '#/api/describe-error.js';
import { usePendingProposals } from '#/api/use-proposals.js';
import { ProposalCard } from '#/components/pipelines/proposal-card.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { projectPath } from '#/domain/nav-entries.js';

export function InboxProposal(props: { slug: string; itemId: string }) {
  const query = usePendingProposals(props.slug);
  const id = Number(parseInboxItemId(props.itemId)?.sourceId);

  if (query.isPending) {
    return <StatePanel kind="loading" label="Loading the suggestion" />;
  }

  if (query.data === undefined) {
    const { title, detail } = describeError(query.error);

    return (
      <StatePanel
        kind="error"
        title={title}
        detail={detail}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  const proposal = query.data.find((item) => item.id === id);

  if (proposal === undefined) {
    return (
      <StatePanel kind="empty" title="This suggestion was already decided" compact>
        It is no longer waiting for you.{' '}
        <Link
          className="font-medium text-signal underline"
          to={projectPath(props.slug, 'settings/pipelines')}
        >
          Open Pipelines
        </Link>
      </StatePanel>
    );
  }

  return <ProposalCard slug={props.slug} proposal={proposal} compact />;
}
