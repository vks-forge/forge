/**
 * CardPage: one card, the conversation with its Director and the work that came out of it.
 *
 * Why: a card is a request the user and the Director talk through, so this is where the user
 *   steers intent (the Worker thread on a ticket is where they watch the doing). The owner must
 *   always be able to read and type in the chat, so the chat is the main column and everything
 *   else is arranged around it (d-0172): a one-row header (title, one status pill, cost, a `⋯`
 *   menu), the composer always visible, and everything waiting on the owner in ONE dock directly
 *   above the composer that shows one item at a time. The dock is fed by the card detail's
 *   `needs_you_detail`, not by whichever slice of history loaded. Plan, Evidence, Tickets, History and
 *   Details sit in a rail beside the chat from 1280 px, as tabs above it from 1024 px, and as a
 *   full-screen sheet from the header below that. The view is a path segment
 *   (`/cards/FX-C2/plan`): the Conversation is the default, an unknown tab replaces itself with
 *   it, an old `?tab=` link is mapped, Back and Forward step through views, and each tab keeps
 *   its scroll. Loading, not-found, error (with retry) and offline-with-old-data are each handled
 *   in words (the last two as one slim line under the header, not a box); an id that does not
 *   exist is a clear "no such card", not an empty page.
 *
 * Exports: CardPage.
 * Depends on: react, react-router, lucide-react, api/use-card, api/use-card-board, api/use-plan,
 *   api/use-escalations, api/use-research, api/describe-error, components/status/state-panel,
 *   components/work/*, domain/card-rail, domain/nav-entries, domain/route-tabs,
 *   routes/card/* (incl. tabs/*, close-dialog, use-card-dock), state/use-online,
 *   state/use-scroll-memory, state/use-work-layout.
 */

import { SearchX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import { useCardDetail, useCardEvents, usePatchCard } from '#/api/use-card.js';
import { useCardTypes } from '#/api/use-card-board.js';
import { useCardEscalations } from '#/api/use-escalations.js';
import { usePlan } from '#/api/use-plan.js';
import { useCardEvidence } from '#/api/use-research.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { NeedsYouPill } from '#/components/work/needs-you-pill.js';
import { WorkLayout } from '#/components/work/work-layout.js';
import { cardPath } from '#/domain/card-paths.js';
import { defaultRailTab } from '#/domain/card-rail.js';
import { projectPath } from '#/domain/nav-entries.js';
import {
  CARD_TAB_IDS,
  legacyCardTab,
  resolveTab,
  shownCardTabs,
} from '#/domain/route-tabs.js';
import { CardHeader } from '#/routes/card/card-header.js';
import { CloseDialog } from '#/routes/card/close-dialog.js';
import { PlanDialogs } from '#/routes/card/plan/plan-dialogs.js';
import { PlanTab } from '#/routes/card/plan/plan-tab.js';
import { usePlanDecisions } from '#/routes/card/plan/use-plan-decisions.js';
import { ConversationTab } from '#/routes/card/tabs/conversation-tab.js';
import { DetailsTab } from '#/routes/card/tabs/details-tab.js';
import { EvidenceTab } from '#/routes/card/tabs/evidence-tab.js';
import { HistoryTab } from '#/routes/card/tabs/history-tab.js';
import { TicketsTab } from '#/routes/card/tabs/tickets-tab.js';
import { useCardDock } from '#/routes/card/use-card-dock.js';
import { useNotify } from '#/state/notify/notify-context.js';
import { useOnline } from '#/state/use-online.js';
import { useScrollMemory } from '#/state/use-scroll-memory.js';
import { useWorkLayoutMode } from '#/state/use-work-layout.js';
import type { CardTab } from '#/types/cards-ui.types.js';
import type { RouteTab } from '#/types/route-tabs.types.js';

const TAB_LABEL: Readonly<Record<CardTab, string>> = {
  conversation: 'Conversation',
  plan: 'Plan',
  evidence: 'Evidence',
  tickets: 'Tickets',
  history: 'History',
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
  const mode = useWorkLayoutMode();
  const card = query.data;
  const { tab, known } = resolveTab<CardTab>(segment, CARD_TAB_IDS, 'conversation');
  const legacy = segment === undefined ? legacyCardTab(params.get('tab')) : null;
  const goTab = (next: CardTab): void => void navigate(cardPath(slug, id, next));

  const decisions = usePlanDecisions(id, () => goTab('plan'));
  const history = useCardEvents(id);
  const plan = usePlan(id);
  const evidence = useCardEvidence(id);
  const escalations = useCardEscalations(id);
  const hasPlan = plan.data?.current != null;

  const dock = useCardDock({
    cardId: id,
    card,
    events: history.data?.events,
    escalations: escalations.data?.items,
    decisions,
    hasPlan,
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

  const railTab = defaultRailTab({ hasPlan, ticketCount: card.tickets.length });
  const sheetTarget = tab === 'conversation' ? railTab : tab;
  const shownTab: CardTab = mode === 'rail' && tab === 'conversation' ? railTab : tab;

  const tabs: readonly RouteTab[] = shownCardTabs(evidence.data, shownTab).map(
    (tabId) => ({
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
    }),
  );

  const status = !online ? (
    <p role="status" className="shrink-0 rounded-lg bg-attn-soft px-3 py-1.5 text-sm">
      You are offline. This page shows the last data Forge sent.
    </p>
  ) : query.isRefetchError ? (
    <p role="alert" className="shrink-0 rounded-lg bg-danger-soft px-3 py-1.5 text-sm">
      Could not refresh this card. {describeError(query.error).detail}
    </p>
  ) : null;

  const questionOpen = dock.some((view) => view.kind === 'director_questions');

  return (
    <WorkLayout
      mode={mode}
      idPrefix="card"
      label="Card"
      contextTitle="Plan and details"
      active={tab}
      railTab={railTab}
      tabs={tabs}
      memory={memory}
      onCloseSheet={() => goTab('conversation')}
      header={
        <CardHeader
          card={card}
          types={types.data}
          patch={patch}
          onClose={() => setClosing(true)}
          contextTo={mode === 'sheet' ? cardPath(slug, id, sheetTarget) : undefined}
          alert={<NeedsYouPill views={dock} online={online} />}
        />
      }
      status={status}
      extras={
        <>
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
          <PlanDialogs cardId={card.id} decisions={decisions} />
        </>
      }
      chat={
        <ConversationTab
          card={card}
          types={types.data}
          memory={memory}
          questionOpen={questionOpen}
          onReviewPlan={() => goTab('plan')}
          onSuggestClose={(suggested) => {
            setReason(suggested);
            setClosing(true);
          }}
        />
      }
      panel={
        <>
          {shownTab === 'plan' ? (
            <div className="mx-auto max-w-4xl">
              <PlanTab card={card} decisions={decisions} />
            </div>
          ) : null}
          {shownTab === 'evidence' ? <EvidenceTab card={card} /> : null}
          {shownTab === 'tickets' ? (
            <TicketsTab slug={card.project} tickets={card.tickets} />
          ) : null}
          {shownTab === 'history' ? (
            <HistoryTab slug={card.project} cardId={card.id} />
          ) : null}
          {shownTab === 'details' ? <DetailsTab card={card} /> : null}
        </>
      }
    />
  );
}
