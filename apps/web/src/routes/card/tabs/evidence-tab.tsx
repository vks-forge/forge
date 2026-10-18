/**
 * EvidenceTab: the outside facts a card's plan can lean on, each with what backs it.
 *
 * Why: the Director may look things up on the web while it plans, and the owner approves the
 *   plan, so the owner must be able to see every fact, whether it was checked against its
 *   page (Verified) or not (Unverified, with the reason), and the page itself. Claims are
 *   grouped under the question they answer; a second list shows every page the Director read,
 *   cited or not, with where it came from. A header says how much of the card's research
 *   allowance is spent. When research could not run (switched off, the provider down, the
 *   limit reached) the tab says so in the words the Director left on the card and links to the
 *   setting, instead of an empty page. Loading, error (with Retry), empty and settled are each
 *   handled; the list refetches when the server announces new evidence, and a link ending in
 *   `#evidence-E1` from the plan scrolls to that claim.
 *
 * Exports: EvidenceTab.
 * Depends on: react, react-router, lucide-react, api/use-card, api/use-research,
 *   api/describe-error, components/research/*, components/status/state-panel,
 *   components/ui/empty-state, domain/research-copy, domain/research-evidence, domain/nav-entries,
 *   schemas/cards (type).
 */

import { Telescope } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { describeError } from '#/api/describe-error.js';
import { useCardEvents } from '#/api/use-card.js';
import { useCardEvidence } from '#/api/use-research.js';
import { ClaimCard } from '#/components/research/claim-card.js';
import { PagesRead } from '#/components/research/pages-read.js';
import { SourceDrawer } from '#/components/research/source-drawer.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { EmptyState } from '#/components/ui/empty-state.js';
import { settingsPath } from '#/domain/nav-entries.js';
import { noteNeedsSettings, researchLineOf } from '#/domain/research-copy.js';
import {
  groupByQuestion,
  runsLine,
  unverifiedCount,
} from '#/domain/research-evidence.js';
import type { CardDetailReply } from '#/schemas/cards.js';

/** What the Director said when it could not look something up, oldest first, without repeats. */
function useResearchNotes(cardId: string): readonly string[] {
  const events = useCardEvents(cardId).data?.events ?? [];
  const notes = events
    .filter((event) => event.kind === 'research')
    .flatMap((event) => {
      const { note } = researchLineOf(event.payload);

      return note === null ? [] : [note];
    });

  return [...new Set(notes)];
}

export function EvidenceTab(props: { card: CardDetailReply }) {
  const { card } = props;
  const query = useCardEvidence(card.id);
  const notes = useResearchNotes(card.id);
  const [open, setOpen] = useState<{ ref: string; quote: string | undefined } | null>(
    null,
  );

  const { hash } = useLocation();
  const ready = query.data !== undefined;

  useEffect(() => {
    if (ready && hash !== '') {
      document.getElementById(hash.slice(1))?.scrollIntoView?.({ block: 'start' });
    }
  }, [ready, hash]);

  if (query.isPending) {
    return <StatePanel kind="loading" label="Loading the evidence" />;
  }

  if (query.isError && !query.data) {
    return (
      <StatePanel
        kind="error"
        title={describeError(query.error).title}
        detail={describeError(query.error).detail}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  const { evidence, sources, runs_used: used, runs_cap: cap } = query.data;
  const groups = groupByQuestion(evidence);
  const unverified = unverifiedCount(evidence);
  const help = notes.some(noteNeedsSettings);

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <header className="grid gap-1">
        <h2 className="text-base font-semibold">Evidence</h2>
        <p className="text-sm text-muted">
          {runsLine(used, cap)}
          {evidence.length > 0
            ? ` · ${evidence.length} fact${evidence.length === 1 ? '' : 's'}${
                unverified > 0 ? `, ${unverified} unverified` : ', all verified'
              }`
            : ''}
        </p>
      </header>

      {query.isRefetchError ? (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm">
          Could not refresh the evidence. {describeError(query.error).detail}
        </p>
      ) : null}

      {notes.length > 0 ? (
        <section
          aria-label="What research said"
          className="grid gap-1 rounded-xl border border-line bg-surface p-3 text-sm"
        >
          {notes.map((note) => (
            <p key={note} className="min-w-0 break-words">
              {note}
            </p>
          ))}
          {help ? (
            <Link
              to={settingsPath('research')}
              className="w-fit font-medium text-signal underline-offset-2 hover:underline"
            >
              Open Research settings
            </Link>
          ) : null}
        </section>
      ) : null}

      {evidence.length === 0 ? (
        <EmptyState variant="compact" icon={Telescope} title="No facts were kept">
          {used === 0
            ? 'The Director has not looked anything up on this card.'
            : 'Research ran but kept no fact it could cite. The plan goes to you without outside facts.'}
        </EmptyState>
      ) : (
        groups.map((group, index) => (
          <section
            key={`${index}-${group.question ?? ''}`}
            aria-label={group.question ?? 'Other facts'}
            className="grid gap-3"
          >
            <h3 className="min-w-0 break-words text-sm font-semibold">
              {group.question ?? 'Other facts'}
            </h3>
            <ul className="grid gap-3">
              {group.claims.map((claim) => (
                <ClaimCard
                  key={claim.ref}
                  claim={claim}
                  onOpen={(ref, quote) => setOpen({ ref, quote })}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      <PagesRead sources={sources} onOpen={(ref) => setOpen({ ref, quote: undefined })} />

      <SourceDrawer
        cardId={card.id}
        sourceRef={open?.ref ?? null}
        quote={open?.quote}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
