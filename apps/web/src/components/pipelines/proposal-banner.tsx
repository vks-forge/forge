/**
 * ProposalBanner: the Director's pending suggestions for one lane, shown on that lane's tab.
 *
 * Why: the Inbox tells the owner a suggestion exists; the Pipelines tab is where they compare it
 *   with the lane they are looking at and decide. A suggestion belongs to one lane, so it appears
 *   on that lane's pane, above the editor, as a full card (the change, the evidence, Accept and
 *   Reject). Nothing shows when there is nothing to decide, so the tab stays quiet; if Forge cannot
 *   be asked, a line says so with a retry instead of pretending there is nothing.
 *
 * Exports: ProposalBanner.
 * Depends on: lucide-react, api/describe-error, api/use-proposals, components/pipelines/proposal-card,
 *   components/ui/button, @forge/core (types).
 */

import { Lightbulb } from 'lucide-react';
import type { Lane } from '@forge/core';
import { describeError } from '#/api/describe-error.js';
import { usePendingProposals } from '#/api/use-proposals.js';
import { ProposalCard } from '#/components/pipelines/proposal-card.js';
import { Button } from '#/components/ui/button.js';

export function ProposalBanner(props: { slug: string; lane: Lane }) {
  const query = usePendingProposals(props.slug);

  if (query.isError && query.data === undefined) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-3 rounded-xl bg-danger-soft p-3 text-sm"
      >
        <span>{`Could not check for the Director’s suggestions. ${describeError(query.error).detail}`}</span>
        <Button
          onClick={() => void query.refetch()}
          status={query.isFetching ? 'loading' : 'idle'}
        >
          Try again
        </Button>
      </div>
    );
  }

  const mine = (query.data ?? []).filter((proposal) => proposal.lane === props.lane);

  if (mine.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="The Director’s suggestions for this lane"
      className="grid gap-2 rounded-xl border border-attn bg-attn-soft p-3"
    >
      <h4 className="flex items-center gap-1.5 text-sm font-semibold">
        <Lightbulb aria-hidden="true" className="size-4" />
        {`The Director suggests ${mine.length === 1 ? 'a change' : `${mine.length} changes`} to this lane`}
      </h4>
      {mine.map((proposal) => (
        <ProposalCard key={proposal.id} slug={props.slug} proposal={proposal} />
      ))}
    </section>
  );
}
