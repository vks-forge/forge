/**
 * TicketPage: one ticket, its Worker thread, its review, its runs and its details, as tabs.
 *
 * Why: this is where a person follows and unblocks a single piece of work. The page is a frame
 *   that fills the screen: a compact header (state, lane, cost, title), whatever waits on the
 *   owner (a question or failure to answer, a ready-for-review notice linking to the Review
 *   tab, which the Review tab itself replaces), a tab strip and one panel. The tab is a path segment (`/tickets/FX-4/runs`):
 *   Conversation (the Worker thread and steer box) is the default and an unknown tab replaces
 *   itself with it; Review exists only while the ticket waits on review or sign-off, so
 *   `/review` on any other ticket redirects too; Runs lists the attempts and Details the
 *   metadata and cost. `?run=` picks which run's thread the Conversation shows. The thread and
 *   its stream live above the tabs (keyed by run, so one run's lines never leak into another's),
 *   so switching tabs does not reconnect. A pipeline strip sits above the tabs on every one: the
 *   stages of the ticket's lane and where it is in them. Loading, not-found, error (with retry) and
 *   offline-with-old-data are each handled in words; a ticket id that does not exist is a clear
 *   "no such ticket", not an empty page.
 *
 * Exports: TicketPage.
 * Depends on: react, react-router, api/use-tickets, api/describe-error, components/thread/*,
 *   components/status/state-panel, components/ui/*, domain/route-tabs, domain/thread,
 *   domain/ticket-paths, routes/ticket/*, state/use-online, state/use-scroll-memory.
 */

import { CircleAlert, SearchX } from 'lucide-react';
import { useEffect } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router';
import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import { useTicketDetail } from '#/api/use-tickets.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { useRunThread } from '#/components/thread/use-run-thread.js';
import { RouteTabs } from '#/components/ui/route-tabs.js';
import { ScrollArea } from '#/components/ui/scroll-area.js';
import { TabPanel } from '#/components/ui/tab-panel.js';
import { projectPath } from '#/domain/nav-entries.js';
import { TICKET_TAB_IDS, resolveTab, ticketHasReview } from '#/domain/route-tabs.js';
import { pendingAsk } from '#/domain/thread.js';
import { ticketPath } from '#/domain/ticket-paths.js';
import { ticketStamp } from '#/domain/ticket-stamp.js';
import { AnswerPanel } from '#/routes/ticket/answer-panel.js';
import { PipelineStrip } from '#/routes/ticket/pipeline-strip.js';
import { ConversationTab } from '#/routes/ticket/tabs/conversation-tab.js';
import { DetailsTab } from '#/routes/ticket/tabs/details-tab.js';
import { ReviewTab } from '#/routes/ticket/tabs/review-tab.js';
import { RunsTab } from '#/routes/ticket/tabs/runs-tab.js';
import { TicketHeader } from '#/routes/ticket/ticket-header.js';
import type { TicketDetail } from '#/schemas/tickets.js';
import { useOnline } from '#/state/use-online.js';
import { useScrollMemory } from '#/state/use-scroll-memory.js';
import type { RouteTab, ScrollMemory, TicketTab } from '#/types/route-tabs.types.js';

const TAB_LABEL: Readonly<Record<TicketTab, string>> = {
  conversation: 'Conversation',
  review: 'Review',
  runs: 'Runs',
  details: 'Details',
};

/**
 * Everything under the header, for one chosen run. Keyed by run so the thread's state never
 * crosses runs; the stream is opened here and shared by the banners and the Conversation tab.
 */
function TicketBody(props: {
  slug: string;
  detail: TicketDetail;
  runId: string | undefined;
  /** The `?run=` the URL carries, kept on every tab link so the choice survives tab changes. */
  runParam: string | undefined;
  tab: TicketTab;
  hasReview: boolean;
  memory: ScrollMemory;
}) {
  const { slug, detail, runId, tab, hasReview } = props;
  const thread = useRunThread(runId);
  const id = detail.ticket.id;

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
    ...(tabId === 'review'
      ? {
          attention: true,
          mark: <span aria-hidden="true" className="size-2 rounded-full bg-attn" />,
        }
      : {}),
  }));

  return (
    <>
      <ScrollArea className="grid max-h-[40dvh] shrink-0 gap-2 has-[>div:empty]:hidden">
        <AnswerPanel
          detail={detail}
          showWait={!hasReview}
          streamedPrompt={(interactionId) => pendingAsk(thread.items, interactionId)}
        />
        {hasReview && tab !== 'review' ? (
          <section
            aria-label="Waiting for your review"
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border-2 border-attn bg-attn-soft p-3"
          >
            <p className="flex items-center gap-2 text-sm font-semibold">
              <CircleAlert aria-hidden="true" className="size-5 shrink-0 text-attn" />
              {detail.ticket.status === 'needs_signoff'
                ? 'This ticket needs your sign-off.'
                : 'This ticket is ready for your review.'}
            </p>
            <Link
              to={ticketPath(slug, id, 'review')}
              className="text-sm font-medium text-signal underline-offset-2 hover:underline"
            >
              Open the review
            </Link>
          </section>
        ) : null}
      </ScrollArea>

      <PipelineStrip slug={slug} ticketId={id} stamp={ticketStamp(detail)} />
      <RouteTabs label="Ticket" idPrefix="ticket" tabs={tabs} active={tab} />
      <TabPanel
        idPrefix="ticket"
        tab={tab}
        memory={props.memory}
        scroll={tab !== 'conversation'}
      >
        {tab === 'conversation' ? (
          <ConversationTab
            detail={detail}
            runId={runId}
            thread={thread}
            memory={props.memory}
          />
        ) : null}
        {tab === 'review' ? <ReviewTab detail={detail} /> : null}
        {tab === 'runs' ? (
          <RunsTab slug={slug} detail={detail} selectedId={runId} />
        ) : null}
        {tab === 'details' ? <DetailsTab slug={slug} detail={detail} /> : null}
      </TabPanel>
    </>
  );
}

export function TicketPage() {
  const { slug = '', id = '', tab: segment } = useParams();
  const [params] = useSearchParams();
  const query = useTicketDetail(id);
  const online = useOnline();
  const memory = useScrollMemory();
  const detail = query.data;
  const resolved = resolveTab<TicketTab>(segment, TICKET_TAB_IDS, 'conversation');
  const runParam = params.get('run') ?? undefined;

  useEffect(() => {
    document.title = `${id} · Forge`;
  }, [id]);

  if (segment !== undefined && !resolved.known) {
    return <Navigate to={ticketPath(slug, id, 'conversation', runParam)} replace />;
  }

  if (query.isPending) {
    return <StatePanel kind="loading" label="Loading ticket" />;
  }

  if (query.isError && !detail) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <StatePanel
          kind="empty"
          icon={SearchX}
          title={`There is no ticket ${id}`}
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

    const { title, detail: text } = describeError(query.error);

    return (
      <StatePanel
        kind="error"
        title={title}
        detail={text}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  if (!detail) {
    return null;
  }

  const hasReview = ticketHasReview(detail.ticket.status);
  // The Review tab is only there while the ticket waits on it: its URL falls back, not 404s.
  if (resolved.tab === 'review' && !hasReview) {
    return <Navigate to={ticketPath(slug, id, 'conversation', runParam)} replace />;
  }

  const newest = [...detail.runs].sort((a, b) =>
    b.started_at.localeCompare(a.started_at),
  )[0];

  const chosen = detail.runs.some((run) => run.id === runParam) ? runParam : undefined;
  const runId = chosen ?? detail.ticket.assignee_run_id ?? newest?.id;

  return (
    <section className="page-fill flex min-w-0 flex-col gap-2">
      <TicketHeader slug={slug} detail={detail} />
      {!online ? (
        <p role="status" className="shrink-0 rounded-xl bg-attn-soft p-3 text-sm">
          You are offline. This page shows the last data Forge sent.
        </p>
      ) : query.isRefetchError ? (
        <p role="alert" className="shrink-0 rounded-xl bg-danger-soft p-3 text-sm">
          Could not refresh this ticket. {describeError(query.error).detail}
        </p>
      ) : null}
      <TicketBody
        key={runId ?? 'none'}
        slug={slug}
        detail={detail}
        runId={runId}
        runParam={chosen}
        tab={resolved.tab}
        hasReview={hasReview}
        memory={memory}
      />
    </section>
  );
}
