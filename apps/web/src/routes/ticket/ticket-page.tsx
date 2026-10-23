/**
 * TicketPage: one ticket, its Worker thread and what waits on the owner, in the Card page's frame.
 *
 * Why: this is where a person follows and unblocks a single piece of work. The Worker thread is
 *   the main column with its steer box, a one-row header (id, title, one status pill, cost) sits
 *   above it, and everything waiting on the owner (a question, a failure, a held decision, a
 *   sign-off) is in one dock directly above the steer box, so the owner decides next to the work
 *   instead of on a tab (d-0172, components/work). Review, Runs, History and Details sit in a rail beside
 *   the thread from 1280 px, as tabs above it from 1024 px, and as a full-screen sheet from the
 *   header below that. The view is a path segment (`/tickets/FX-4/runs`): Conversation is the
 *   default and an unknown tab replaces itself with it; Review exists only while the ticket
 *   waits on review or sign-off or is held for the owner's decision, so `/review` on any other
 *   ticket redirects too. `?run=` picks which run's thread the Conversation shows. This page
 *   loads the ticket and settles loading, not-found, error (with retry), offline-with-old-data
 *   (one slim line) and the redirects; a ticket id that does not exist is a clear "no such
 *   ticket", not an empty page. The rest is routes/ticket/ticket-frame, keyed by run.
 *
 * Exports: TicketPage.
 * Depends on: react, react-router, api/use-tickets, api/describe-error, components/status/state-panel,
 *   domain/nav-entries, domain/route-tabs, domain/ticket-paths, routes/ticket/ticket-frame,
 *   state/use-kept-escalations, state/use-online, state/use-scroll-memory.
 */

import { SearchX } from 'lucide-react';
import { useEffect } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router';
import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import { useTicketDetail } from '#/api/use-tickets.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { projectPath } from '#/domain/nav-entries.js';
import { TICKET_TAB_IDS, resolveTab, ticketHasReview } from '#/domain/route-tabs.js';
import { ticketPath } from '#/domain/ticket-paths.js';
import { TicketFrame } from '#/routes/ticket/ticket-frame.js';
import type { TicketTab } from '#/types/route-tabs.types.js';
import { useKeptEscalations } from '#/state/use-kept-escalations.js';
import { useOnline } from '#/state/use-online.js';
import { useScrollMemory } from '#/state/use-scroll-memory.js';

export function TicketPage() {
  const { slug = '', id = '', tab: segment } = useParams();
  const [params] = useSearchParams();
  const query = useTicketDetail(id);
  const online = useOnline();
  const memory = useScrollMemory();
  const detail = query.data;
  const resolved = resolveTab<TicketTab>(segment, TICKET_TAB_IDS, 'conversation');
  // Above the early returns and the tab redirect: an item settled on the Review tab must still be
  // drawn (as its one-line settled card) once the ticket no longer has that tab.
  const { shown, keep } = useKeptEscalations(detail?.escalations ?? []);
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

  const hasReview = ticketHasReview(detail);
  // The Review tab is only there while the ticket waits on it: its URL falls back, not 404s.
  if (resolved.tab === 'review' && !hasReview) {
    return <Navigate to={ticketPath(slug, id, 'conversation', runParam)} replace />;
  }

  const newest = [...detail.runs].sort((a, b) =>
    b.started_at.localeCompare(a.started_at),
  )[0];

  const chosen = detail.runs.some((run) => run.id === runParam) ? runParam : undefined;
  const runId = chosen ?? detail.ticket.assignee_run_id ?? newest?.id;

  const notice = !online ? (
    <p role="status" className="shrink-0 rounded-lg bg-attn-soft px-3 py-1.5 text-sm">
      You are offline. This page shows the last data Forge sent.
    </p>
  ) : query.isRefetchError ? (
    <p role="alert" className="shrink-0 rounded-lg bg-danger-soft px-3 py-1.5 text-sm">
      Could not refresh this ticket. {describeError(query.error).detail}
    </p>
  ) : null;

  return (
    <TicketFrame
      key={runId ?? 'none'}
      slug={slug}
      detail={detail}
      runId={runId}
      runParam={chosen}
      tab={resolved.tab}
      hasReview={hasReview}
      memory={memory}
      escalations={shown}
      onKeep={keep}
      notice={notice}
    />
  );
}
