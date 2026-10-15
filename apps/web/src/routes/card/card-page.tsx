/**
 * CardPage: one card, the conversation with its Director and the work that came out of it.
 *
 * Why: a card is a request the user and the Director talk through, so this is where the
 *   user steers intent (the Worker thread on a ticket is where they watch the doing). It loads
 *   the card (refreshing on a slow poll and on focus), shows the header, an amber banner when
 *   questions wait on the user (each links to its ticket), and three tabs: Chat, Tickets, Details.
 *   The tab lives in the URL (`?tab=`), so a link opens the right view and Back works. Loading,
 *   not-found, error (with retry) and offline-with-old-data are each handled in words; an id
 *   that does not exist is a clear "no such card", not an empty page.
 *
 * Exports: CardPage.
 * Depends on: react, react-router, lucide-react, api/use-card, api/use-card-board, api/describe-error,
 *   components/status/state-panel, components/card/*, domain/nav-entries, routes/card/* (incl. close-dialog),
 *   state/use-online.
 */

import { CircleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import { useCardDetail, usePatchCard } from '#/api/use-card.js';
import { useCardTypes } from '#/api/use-card-board.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { TicketLink } from '#/components/ticket/ticket-link.js';
import { projectPath } from '#/domain/nav-entries.js';
import { CardChat } from '#/routes/card/card-chat.js';
import { CardDetails } from '#/routes/card/card-details.js';
import { CardHeader } from '#/routes/card/card-header.js';
import { CloseDialog } from '#/routes/card/close-dialog.js';
import { CARD_TABS, CardTabs } from '#/routes/card/card-tabs.js';
import { CardTickets } from '#/routes/card/card-tickets.js';
import { useOnline } from '#/state/use-online.js';
import type { CardTab } from '#/types/cards-ui.types.js';

function tabOf(value: string | null): CardTab {
  return CARD_TABS.find((tab) => tab.id === value)?.id ?? 'chat';
}

export function CardPage() {
  const { slug = '', id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const query = useCardDetail(id);
  const types = useCardTypes();
  const patch = usePatchCard(id);
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState('');
  const online = useOnline();
  const card = query.data;
  const tab = tabOf(params.get('tab'));

  useEffect(() => {
    document.title = `${id} · Forge`;
  }, [id]);

  if (query.isPending) {
    return <StatePanel kind="loading" label="Loading card" />;
  }

  if (query.isError && !card) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <StatePanel kind="empty" title={`There is no card ${id}`}>
          <Link
            className="font-medium text-signal underline"
            to={projectPath(slug, 'board')}
          >
            Back to the Board
          </Link>
        </StatePanel>
      );
    }

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

  if (!card) {
    return null;
  }

  const waiting = card.pending_interactions.filter((i) => i.status === 'pending');
  const ticketsNeedingYou = card.tickets.some((t) => t.needs_you);

  return (
    <section className="grid gap-6">
      <CardHeader
        card={card}
        types={types.data}
        patch={patch}
        onClose={() => setClosing(true)}
      />
      <CloseDialog
        open={closing}
        onOpenChange={setClosing}
        reason={reason}
        onReasonChange={setReason}
        onConfirm={(text) => patch.mutate({ closed_reason: text })}
      />

      {!online ? (
        <p role="status" className="rounded-xl bg-attn-soft p-3 text-sm">
          You are offline. This page shows the last data Forge sent.
        </p>
      ) : query.isRefetchError ? (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm">
          Could not refresh this card. {describeError(query.error).detail}
        </p>
      ) : null}

      {waiting.length > 0 ? (
        <div className="grid gap-1 rounded-2xl border-2 border-attn bg-attn-soft p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <CircleAlert aria-hidden="true" className="size-5 text-attn" />
            {waiting.length === 1
              ? 'A question is waiting for you'
              : `${waiting.length} questions are waiting for you`}
          </p>
          <p className="text-sm">
            Answer on the ticket:{' '}
            {[...new Set(waiting.map((i) => i.ticket_id))].map((ticketId, index) => (
              <span key={ticketId}>
                {index > 0 ? ', ' : ''}
                <TicketLink id={ticketId} slug={slug} />
              </span>
            ))}
          </p>
        </div>
      ) : null}

      <div className="grid gap-4">
        <CardTabs
          tab={tab}
          ticketCount={card.tickets.length}
          needsYou={ticketsNeedingYou}
          onChange={(next) =>
            setParams(next === 'chat' ? {} : { tab: next }, { replace: true })
          }
        />
        <div id="card-panel" role="tabpanel" aria-labelledby={`card-tab-${tab}`}>
          {tab === 'chat' ? (
            <CardChat
              card={card}
              types={types.data}
              onSuggestClose={(suggested) => {
                setReason(suggested);
                setClosing(true);
              }}
            />
          ) : null}
          {tab === 'tickets' ? <CardTickets slug={slug} tickets={card.tickets} /> : null}
          {tab === 'details' ? <CardDetails card={card} /> : null}
        </div>
      </div>
    </section>
  );
}
