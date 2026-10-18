/**
 * The Inbox items of a project's pending pipeline proposals.
 *
 * Why: a proposal of the Director to change a lane belongs to the project, not to a ticket, so it blocks nothing and is
 *   not an escalation (d-0135 asks only that it be shown where the owner looks): it is one Inbox item while pending,
 *   `pipeline_proposal:<id>`, that needs the owner's decision and is dated by when it was made; accepted, rejected and
 *   stale ones drop out. Like every Inbox item it is derived from its source row on each read, never copied.
 *
 * Exports: pipelineProposalItems().
 * Depends on: @forge/core (inboxItemId, InboxCandidate). IO: reads storage.
 */

import { inboxItemId } from '@forge/core';
import type { InboxCandidate, PipelineProposal, StorageTx } from '@forge/core';

const clip = (text: string, max = 140): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** The line a pipeline proposal shows in the Inbox: the change, on its lane. */
function proposalTitle(p: PipelineProposal): string {
  const { op } = p;
  const what =
    op.op === 'add'
      ? `add ${op.stage.kind === 'agent' ? op.stage.agent : op.stage.label} after ${op.after}`
      : op.op === 'remove'
        ? `remove ${op.stage_id}`
        : op.op === 'swap'
          ? `use ${op.agent} for ${op.member_id ?? op.stage_id}`
          : `move ${op.stage_id} after ${op.after}`;

  return clip(`Pipeline change proposed for ${p.lane}: ${what}`);
}

/** One needs-action item per pending proposal of project `slug`, newest first. */
export async function pipelineProposalItems(
  tx: StorageTx,
  slug: string,
): Promise<InboxCandidate[]> {
  return (await tx.pipelineProposals.list(slug, 'pending')).map((p) => ({
    id: inboxItemId('pipeline_proposal', String(p.id)),
    kind: 'pipeline_proposal',
    project: slug,
    title: proposalTitle(p),
    detail: `Made the same change on ${p.count} tickets`,
    needs_action: true,
    updated_at: p.created_at,
  }));
}
