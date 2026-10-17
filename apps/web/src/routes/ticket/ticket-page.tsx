/**
 * TicketPage: one ticket, its checks, its runs and the live Worker thread.
 *
 * Why: this is where a person follows and unblocks a single piece of work. It loads the
 *   ticket (refreshing on a slow poll and on focus), shows header, gates and runs, and
 *   streams the current run's thread. Amber questions sit above the thread. Choosing a past
 *   run replays that run's thread; while the current run is live, a "Message the Worker" box
 *   under the thread steers it; the thread is re-created per run so one run's lines can
 *   never leak into another's. Loading, not-found, error (with retry) and offline-with-old-
 *   data are each handled in words; a ticket id that does not exist is a clear "no such
 *   ticket", not an empty page.
 *
 * Exports: TicketPage.
 * Depends on: react, react-router, api/use-tickets, api/describe-error, components/thread/*,
 *   components/status/state-panel, domain/thread, domain/board-columns, routes/ticket/*,
 *   state/use-online.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError } from '#/api/api-error.js';
import { describeError } from '#/api/describe-error.js';
import { useTicketDetail } from '#/api/use-tickets.js';
import { useRunThread } from '#/components/thread/use-run-thread.js';
import { WorkerThread } from '#/components/thread/worker-thread.js';
import { StatePanel } from '#/components/status/state-panel.js';
import { projectPath } from '#/domain/nav-entries.js';
import { isRunLive } from '#/domain/run-status.js';
import { pendingAsk } from '#/domain/thread.js';
import { AnswerPanel } from '#/routes/ticket/answer-panel.js';
import { TicketHeader } from '#/routes/ticket/ticket-header.js';
import { SteerPanel } from '#/routes/ticket/steer-panel.js';
import { GateStrip, RunsList } from '#/routes/ticket/ticket-side.js';
import { useNow } from '#/state/use-now.js';
import { useOnline } from '#/state/use-online.js';
import type { TicketDetail } from '#/schemas/tickets.js';

/** Thread, questions and runs for one chosen run. Keyed by run so state never crosses runs. */
function TicketBody(props: {
  slug: string;
  detail: TicketDetail;
  runId: string | undefined;
  onSelectRun: (id: string) => void;
}) {
  const { detail, runId } = props;
  const now = useNow();
  const thread = useRunThread(runId);
  const pending = useMemo(
    () => new Set(detail.interactions.map((i) => i.id)),
    [detail.interactions],
  );

  // Steering is for the run the ticket is working on right now, and only while it is live.
  const current = detail.runs.find((run) => run.id === runId);
  const live =
    runId !== undefined &&
    runId === detail.ticket.assignee_run_id &&
    current !== undefined &&
    isRunLive(current.status);

  return (
    <>
      <AnswerPanel
        detail={detail}
        streamedPrompt={(id) => pendingAsk(thread.items, id)}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        {runId === undefined ? (
          <section aria-label="Worker thread" className="grid content-start gap-2">
            <h2 className="text-sm font-semibold">Worker thread</h2>
            <p className="text-sm text-muted">
              No Worker has started on this ticket, so there is nothing to follow yet.
            </p>
          </section>
        ) : (
          <div className="grid content-start gap-3">
            <WorkerThread
              items={thread.items}
              connection={thread.connection}
              endStatus={thread.endStatus}
              notice={thread.notice}
              pending={pending}
              onRetry={thread.retry}
            />
            {live ? <SteerPanel runId={runId} /> : null}
          </div>
        )}
        <RunsList
          runs={detail.runs}
          selectedId={runId}
          onSelect={props.onSelectRun}
          now={now}
        />
      </div>
    </>
  );
}

export function TicketPage() {
  const { slug = '', id = '' } = useParams();
  const query = useTicketDetail(id);
  const online = useOnline();
  // Remembers which ticket the choice was for, so opening another ticket starts fresh.
  const [picked, setPicked] = useState<{ ticket: string; run: string } | undefined>();
  const detail = query.data;

  useEffect(() => {
    document.title = `${id} · Forge`;
  }, [id]);

  if (query.isPending) {
    return <StatePanel kind="loading" label="Loading ticket" />;
  }

  if (query.isError && !detail) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <StatePanel kind="empty" title={`There is no ticket ${id}`}>
          <Link
            className="font-medium text-signal underline"
            to={projectPath(slug, 'board')}
          >
            Back to the Board
          </Link>
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

  const newest = [...detail.runs].sort((a, b) =>
    b.started_at.localeCompare(a.started_at),
  )[0];

  const chosen = picked?.ticket === id ? picked.run : undefined;
  const runId = chosen ?? detail.ticket.assignee_run_id ?? newest?.id;

  return (
    <section className="grid gap-6">
      <TicketHeader slug={slug} detail={detail} />
      {!online ? (
        <p role="status" className="rounded-xl bg-attn-soft p-3 text-sm">
          You are offline. This page shows the last data Forge sent.
        </p>
      ) : query.isRefetchError ? (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm">
          Could not refresh this ticket. {describeError(query.error).detail}
        </p>
      ) : null}
      <GateStrip results={detail.gate_results} />
      <TicketBody
        key={runId ?? 'none'}
        slug={slug}
        detail={detail}
        runId={runId}
        onSelectRun={(run) => setPicked({ ticket: id, run })}
      />
    </section>
  );
}
