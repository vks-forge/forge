/**
 * CardPage: one card, the conversation with its Director and the work that came out of it.
 *
 * Why: a card is a request the user and the Director talk through, so this is where the
 *   user steers intent (the Worker thread on a ticket is where they watch the doing). It loads
 *   the card (refreshing on a slow poll and on focus), shows the header, a pinned Needs you banner
 *   when the Director raised one (with every action it listed wired), an amber banner when
 *   ticket questions wait on the user (each links to its ticket), and the body: the chat with a
 *   Plan / Tickets / Details side panel (tabs below 768 px). The tab lives in the URL
 *   (`?tab=`), so a link opens the right view and Back works. Loading,
 *   not-found, error (with retry) and offline-with-old-data are each handled in words; an id
 *   that does not exist is a clear "no such card", not an empty page.
 *
 * Exports: CardPage.
 * Depends on: react, react-router, lucide-react, api/use-card, api/use-card-board, api/use-plan,
 *   api/describe-error, components/status/state-panel, domain/director-flow, domain/nav-entries,
 *   routes/card/* (incl. close-dialog, card-body, needs-you-banner), state/use-media-query, state/use-online.
 */

import { CircleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import { useCardDetail, useCardEvents, usePatchCard } from '#/api/use-card.js';
import { usePlan } from '#/api/use-plan.js';
import { useCardTypes } from '#/api/use-card-board.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { TicketLink } from '#/components/ticket/ticket-link.js';
import { activeNeedsYou } from '#/domain/director-flow.js';
import { projectPath } from '#/domain/nav-entries.js';
import { CardBody } from '#/routes/card/card-body.js';
import { CardHeader } from '#/routes/card/card-header.js';
import { CARD_TABS } from '#/routes/card/card-tabs.js';
import { CloseDialog } from '#/routes/card/close-dialog.js';
import { NeedsYouBanner } from '#/routes/card/needs-you-banner.js';
import { PlanDialogs } from '#/routes/card/plan/plan-dialogs.js';
import { usePlanDecisions } from '#/routes/card/plan/use-plan-decisions.js';
import { useBannerActions } from '#/routes/card/use-banner-actions.js';
import { useNotify } from '#/state/notify/notify-context.js';
import { useMediaQuery } from '#/state/use-media-query.js';
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
  const notify = useNotify();
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState('');
  const online = useOnline();
  const wide = useMediaQuery('(min-width: 768px)');
  const card = query.data;
  const tab = tabOf(params.get('tab'));
  const goTab = (next: CardTab): void =>
    setParams(next === 'chat' ? {} : { tab: next }, { replace: true });

  const decisions = usePlanDecisions(id, () => goTab('plan'));
  const history = useCardEvents(id);
  const plan = usePlan(id);
  const raised = activeNeedsYou(history.data?.events ?? []);
  const needs =
    card && card.needs_you && card.closed_reason === undefined ? raised : null;

  const banner = useBannerActions({
    cardId: id,
    needs,
    hasPlan: plan.data?.current != null,
    tab,
    wide,
    decisions,
    goTab,
  });

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
        onConfirm={(text) =>
          patch.mutate(
            { closed_reason: text },
            { onSuccess: () => notify.success('Card closed') },
          )
        }
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

      {needs ? (
        <NeedsYouBanner
          needs={needs}
          busy={banner.busy}
          error={banner.error}
          onAction={banner.run}
        />
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

      <PlanDialogs cardId={card.id} decisions={decisions} />

      <CardBody
        card={card}
        types={types.data}
        tab={tab}
        wide={wide}
        decisions={decisions}
        onTab={goTab}
        onSuggestClose={(suggested) => {
          setReason(suggested);
          setClosing(true);
        }}
      />
    </section>
  );
}
