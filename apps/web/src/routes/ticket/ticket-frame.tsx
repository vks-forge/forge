/**
 * TicketFrame: everything of the Ticket page under the loaded ticket, for one chosen run.
 *
 * Why: the Worker thread is the main column and must always be readable (and steerable while the
 *   run is live), with everything that waits on the owner in one dock directly above the steer box
 *   (d-0172, the same frame as the Card page). Review, Runs, History and Details sit in a rail beside the
 *   thread from 1280 px, as tabs above it from 1024 px, and as a full-screen sheet opened from
 *   the header below that; the pipeline strip stays under the header in every mode. The view is
 *   the URL's tab segment, so links, Back and reload land on the same view. Keyed by run by the
 *   page so one run's thread and stream never leak into another's; the stream is opened here and
 *   shared by the dock (a question's streamed prompt) and the Conversation.
 *
 * Exports: TicketFrame.
 * Depends on: react, react-router, lucide-react, components/thread/use-run-thread,
 *   components/work/*, domain/thread, domain/ticket-paths, domain/ticket-rail, domain/route-tabs,
 *   routes/ticket/*, state/use-online, state/use-work-layout, schemas/*, types/*.
 */

import { LayoutPanelLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useRunThread } from '#/components/thread/use-run-thread.js';
import { NeedsYouPill } from '#/components/work/needs-you-pill.js';
import { WorkLayout } from '#/components/work/work-layout.js';
import { TICKET_TAB_IDS } from '#/domain/route-tabs.js';
import { pendingAsk } from '#/domain/thread.js';
import { ticketPath } from '#/domain/ticket-paths.js';
import { defaultTicketRailTab } from '#/domain/ticket-rail.js';
import { isTerminalTicket } from '#/domain/ticket-status-copy.js';
import { PipelineStrip } from '#/routes/ticket/pipeline-strip.js';
import { ConversationTab } from '#/routes/ticket/tabs/conversation-tab.js';
import { DetailsTab } from '#/routes/ticket/tabs/details-tab.js';
import { HistoryTab } from '#/routes/ticket/tabs/history-tab.js';
import { ReviewTab } from '#/routes/ticket/tabs/review-tab.js';
import { RunsTab } from '#/routes/ticket/tabs/runs-tab.js';
import { TicketHeader } from '#/routes/ticket/ticket-header.js';
import { useTicketDock } from '#/routes/ticket/use-ticket-dock.js';
import type { EscalationView } from '#/schemas/escalation.js';
import type { TicketDetail } from '#/schemas/tickets.js';
import { useOnline } from '#/state/use-online.js';
import { useWorkLayoutMode } from '#/state/use-work-layout.js';
import type { RouteTab, ScrollMemory, TicketTab } from '#/types/route-tabs.types.js';

const TAB_LABEL: Readonly<Record<TicketTab, string>> = {
  conversation: 'Conversation',
  review: 'Review',
  runs: 'Runs',
  history: 'History',
  details: 'Details',
};

export function TicketFrame(props: {
  slug: string;
  detail: TicketDetail;
  runId: string | undefined;
  /** The `?run=` the URL carries, kept on the Conversation link so the choice survives tab changes. */
  runParam: string | undefined;
  tab: TicketTab;
  hasReview: boolean;
  memory: ScrollMemory;
  escalations: readonly EscalationView[];
  onKeep: (view: EscalationView) => void;
  /** The slim offline or could-not-refresh line, when there is one. */
  notice: ReactNode;
}) {
  const { slug, detail, runId, tab, hasReview } = props;
  const id = detail.ticket.id;
  const navigate = useNavigate();
  const online = useOnline();
  const mode = useWorkLayoutMode();
  const thread = useRunThread(runId);
  const goTab = (next: TicketTab): void =>
    void navigate(
      ticketPath(slug, id, next, next === 'conversation' ? props.runParam : undefined),
    );

  const dock = useTicketDock({
    detail,
    escalations: props.escalations,
    onKeep: props.onKeep,
    hasReview,
    openReview: () => goTab('review'),
    streamedPrompt: (interactionId) => pendingAsk(thread.items, interactionId),
  });

  const railTab = defaultTicketRailTab(hasReview);
  const sheetTarget = tab === 'conversation' ? railTab : tab;
  const shownTab: TicketTab = mode === 'rail' && tab === 'conversation' ? railTab : tab;

  const tabs: readonly RouteTab[] = TICKET_TAB_IDS.filter(
    (tabId) => tabId !== 'review' || hasReview,
  ).map((tabId) => ({
    id: tabId,
    label: TAB_LABEL[tabId],
    to: ticketPath(
      slug,
      id,
      tabId,
      tabId === 'conversation' ? props.runParam : undefined,
    ),
    // The dock lives in the Conversation; another view says so with a dot (the pill says it too).
    ...(tabId === 'conversation' && dock.views.length > 0
      ? {
          attention: true,
          mark: <span aria-hidden="true" className="size-2 rounded-full bg-attn" />,
        }
      : {}),
    ...(tabId === 'review'
      ? {
          attention: true,
          mark: <span aria-hidden="true" className="size-2 rounded-full bg-attn" />,
        }
      : {}),
  }));

  return (
    <WorkLayout
      mode={mode}
      idPrefix="ticket"
      label="Ticket"
      contextTitle="Runs and details"
      active={tab}
      railTab={railTab}
      tabs={tabs}
      memory={props.memory}
      onCloseSheet={() => goTab('conversation')}
      header={
        <TicketHeader
          slug={slug}
          detail={detail}
          waiting={dock.views.length > 0}
          alert={<NeedsYouPill views={dock.views} online={online} />}
          context={
            mode === 'sheet' ? (
              <Link
                to={ticketPath(slug, id, sheetTarget)}
                aria-label="Runs and details"
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-sm font-medium hover:bg-hover"
              >
                <LayoutPanelLeft aria-hidden="true" className="size-4" />
                <span className="hidden min-[420px]:inline">Runs and details</span>
              </Link>
            ) : undefined
          }
        />
      }
      status={
        <>
          {props.notice}
          <PipelineStrip
            slug={slug}
            ticketId={id}
            finished={isTerminalTicket(detail.ticket.status)}
          />
        </>
      }
      chat={
        <ConversationTab
          detail={detail}
          runId={runId}
          thread={thread}
          memory={props.memory}
          dock={() => dock.after}
        />
      }
      panel={
        <>
          {shownTab === 'review' ? (
            <ReviewTab
              detail={detail}
              decision={mode === 'rail' ? undefined : <div>{dock.after}</div>}
            />
          ) : null}
          {shownTab === 'runs' ? (
            <RunsTab slug={slug} detail={detail} selectedId={runId} />
          ) : null}
          {shownTab === 'history' ? <HistoryTab slug={slug} ticketId={id} /> : null}
          {shownTab === 'details' ? <DetailsTab slug={slug} detail={detail} /> : null}
        </>
      }
    />
  );
}
