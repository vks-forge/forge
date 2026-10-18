/**
 * CardPage: one card, the conversation with its Director and the work that came out of it.
 *
 * Why: a card is a request the user and the Director talk through, so this is where the
 *   user steers intent (the Worker thread on a ticket is where they watch the doing). The page
 *   is a frame that fills the screen: a compact header (title, column, phase, cost, close), the
 *   banners that need the owner (a pinned Needs you banner with every action the Director listed
 *   wired, an amber notice when ticket questions wait on the user, a pinned banner counting
 *   tickets handed to the owner as escalations), a tab strip, and one panel that scrolls
 *   (or, for the Conversation, a list scrolling above a docked box). The tab is a path segment
 *   (`/cards/FX-C2/plan`): Conversation is the default, an unknown tab replaces itself with it,
 *   an old `?tab=` link is mapped to its tab, Back and Forward step through views, and each tab
 *   keeps its scroll. Loading, not-found, error (with retry) and offline-with-old-data are each
 *   handled in words; an id that does not exist is a clear "no such card", not an empty page.
 *
 * Exports: CardPage.
 * Depends on: react, react-router, lucide-react, api/use-card, api/use-card-board, api/use-plan,
 *   api/describe-error, components/status/state-panel, components/ui/route-tabs,
 *   components/ui/tab-panel, domain/director-flow, domain/nav-entries, domain/route-tabs,
 *   routes/card/* (incl. tabs/*, close-dialog, needs-you-banner), state/use-online,
 *   state/use-scroll-memory.
 */

import { CircleAlert, SearchX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import { useCardDetail, useCardEvents, usePatchCard } from '#/api/use-card.js';
import { useCardEscalations } from '#/api/use-escalations.js';
import { usePlan } from '#/api/use-plan.js';
import { useCardEvidence } from '#/api/use-research.js';
import { useCardTypes } from '#/api/use-card-board.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { TicketLink } from '#/components/ticket/ticket-link.js';
import { RouteTabs } from '#/components/ui/route-tabs.js';
import { ScrollArea } from '#/components/ui/scroll-area.js';
import { TabPanel } from '#/components/ui/tab-panel.js';
import { cardPath } from '#/domain/card-paths.js';
import { activeNeedsYou } from '#/domain/director-flow.js';
import { projectPath } from '#/domain/nav-entries.js';
import {
  CARD_TAB_IDS,
  legacyCardTab,
  resolveTab,
  shownCardTabs,
} from '#/domain/route-tabs.js';
import { CardHeader } from '#/routes/card/card-header.js';
import { CloseDialog } from '#/routes/card/close-dialog.js';
import { EscalationBanner } from '#/routes/card/escalation-banner.js';
import { NeedsYouBanner } from '#/routes/card/needs-you-banner.js';
import { PlanDialogs } from '#/routes/card/plan/plan-dialogs.js';
import { PlanTab } from '#/routes/card/plan/plan-tab.js';
import { usePlanDecisions } from '#/routes/card/plan/use-plan-decisions.js';
import { ConversationTab } from '#/routes/card/tabs/conversation-tab.js';
import { DetailsTab } from '#/routes/card/tabs/details-tab.js';
import { EvidenceTab } from '#/routes/card/tabs/evidence-tab.js';
import { TicketsTab } from '#/routes/card/tabs/tickets-tab.js';
import { useBannerActions } from '#/routes/card/use-banner-actions.js';
import { useEscalationFocus } from '#/routes/card/use-escalation-focus.js';
import { useNotify } from '#/state/notify/notify-context.js';
import { useOnline } from '#/state/use-online.js';
import { useScrollMemory } from '#/state/use-scroll-memory.js';
import type { CardTab } from '#/types/cards-ui.types.js';
import type { RouteTab } from '#/types/route-tabs.types.js';

const TAB_LABEL: Readonly<Record<CardTab, string>> = {
  conversation: 'Conversation',
  plan: 'Plan',
  evidence: 'Evidence',
  tickets: 'Tickets',
  details: 'Details',
};

export function CardPage() {
  const { slug = '', id = '', tab: segment } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const query = useCardDetail(id);
  const types = useCardTypes();
  const patch = usePatchCard(id);
  const notify = useNotify();
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState('');
  const online = useOnline();
  const memory = useScrollMemory();
  const card = query.data;
  const { tab, known } = resolveTab<CardTab>(segment, CARD_TAB_IDS, 'conversation');
  const legacy = segment === undefined ? legacyCardTab(params.get('tab')) : null;
  const goTab = (next: CardTab): void => void navigate(cardPath(slug, id, next));

  const decisions = usePlanDecisions(id, () => goTab('plan'));
  const history = useCardEvents(id);
  const plan = usePlan(id);
  const evidence = useCardEvidence(id);
  const raised = activeNeedsYou(history.data?.events ?? []);
  const needs =
    card && card.needs_you && card.closed_reason === undefined ? raised : null;

  const escalations = useCardEscalations(id);
  const showEscalation = useEscalationFocus({ tab, goTab });
  const handed = (escalations.data?.items ?? []).filter(
    (item) => item.stage === 'owner' && item.settled === undefined,
  );

  const banner = useBannerActions({
    cardId: id,
    needs,
    hasPlan: plan.data?.current != null,
    tab,
    decisions,
    goTab,
  });

  useEffect(() => {
    document.title = `${id} · Forge`;
  }, [id]);

  if (segment !== undefined && !known) {
    return <Navigate to={cardPath(slug, id, 'conversation')} replace />;
  }

  if (legacy !== null) {
    return <Navigate to={cardPath(slug, id, legacy)} replace />;
  }

  if (query.isPending) {
    return <StatePanel kind="loading" label="Loading card" />;
  }

  if (query.isError && !card) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <StatePanel
          kind="empty"
          icon={SearchX}
          title={`There is no card ${id}`}
          actions={
            <Link
              className="font-medium text-signal underline"
              to={projectPath(slug, 'board')}
            >
              Back to the Board
            </Link>
          }
        >
          It may have been removed, or the link is mistyped.
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

  // An escalation draws as its own card; only questions it does not cover keep the old notice.
  const covered = new Set((escalations.data?.items ?? []).map((item) => item.id));
  const waiting = card.pending_interactions.filter(
    (i) => i.status === 'pending' && !covered.has(i.id),
  );

  const tabs: readonly RouteTab[] = shownCardTabs(evidence.data, tab).map((tabId) => ({
    id: tabId,
    label: TAB_LABEL[tabId],
    to: cardPath(slug, id, tabId),
    ...(tabId === 'tickets'
      ? {
          count: card.tickets.length,
          attention: card.tickets.some((t) => t.needs_you),
        }
      : {}),
    ...(tabId === 'evidence' ? { count: evidence.data?.evidence.length ?? 0 } : {}),
    ...(tabId === 'plan' && card.phase === 'plan_ready'
      ? {
          ariaLabel: 'Plan, ready for review',
          mark: <span aria-hidden="true" className="size-2 rounded-full bg-attn" />,
        }
      : {}),
  }));

  const hasBanner =
    !online || query.isRefetchError || needs || handed.length > 0 || waiting.length > 0;

  return (
    <section className="page-fill flex min-w-0 flex-col gap-2">
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

      {hasBanner ? (
        <ScrollArea className="grid max-h-[34dvh] shrink-0 gap-2">
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

          {handed.length > 0 && card.closed_reason === undefined ? (
            <EscalationBanner
              slug={slug}
              count={handed.length}
              ticketIds={[...new Set(handed.map((item) => item.ticket_id))]}
              onShowFirst={() => showEscalation(handed[0]?.id ?? '')}
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
        </ScrollArea>
      ) : null}

      <PlanDialogs cardId={card.id} decisions={decisions} />

      <RouteTabs label="Card" idPrefix="card" tabs={tabs} active={tab} />
      <TabPanel idPrefix="card" tab={tab} memory={memory} scroll={tab !== 'conversation'}>
        {tab === 'conversation' ? (
          <ConversationTab
            card={card}
            types={types.data}
            memory={memory}
            onReviewPlan={() => goTab('plan')}
            onSuggestClose={(suggested) => {
              setReason(suggested);
              setClosing(true);
            }}
          />
        ) : null}
        {tab === 'plan' ? (
          <div className="mx-auto max-w-4xl">
            <PlanTab card={card} decisions={decisions} />
          </div>
        ) : null}
        {tab === 'evidence' ? <EvidenceTab card={card} /> : null}
        {tab === 'tickets' ? (
          <TicketsTab slug={card.project} tickets={card.tickets} />
        ) : null}
        {tab === 'details' ? <DetailsTab card={card} /> : null}
      </TabPanel>
    </section>
  );
}
