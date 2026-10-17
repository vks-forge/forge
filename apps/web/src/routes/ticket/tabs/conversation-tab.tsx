/**
 * ConversationTab: the Worker's live thread of one run, with the steer box docked under it.
 *
 * Why: this is where a person watches a Worker think and act and, while the run is live,
 *   redirects it (d-0109). The thread scrolls above a "Message the Worker" box that stays at the
 *   bottom of the screen; the box exists only for the run the ticket is working on right now and
 *   only while it is live, so a finished or past run is a read-only record. Choosing another run
 *   (Runs tab, `?run=`) replays that run's thread. A ticket no Worker has touched says so.
 *
 * Exports: ConversationTab.
 * Depends on: react, lucide-react, components/thread/*, components/ui/empty-state,
 *   domain/run-status, routes/ticket/steer-panel, schemas/tickets (type), types/*.
 */

import { Activity } from 'lucide-react';
import { useMemo } from 'react';
import { WorkerThread } from '#/components/thread/worker-thread.js';
import { EmptyState } from '#/components/ui/empty-state.js';
import { isRunLive } from '#/domain/run-status.js';
import { SteerPanel } from '#/routes/ticket/steer-panel.js';
import type { TicketDetail } from '#/schemas/tickets.js';
import type { ScrollMemory } from '#/types/route-tabs.types.js';
import type { ThreadConnection, ThreadItem } from '#/types/thread.types.js';

export function ConversationTab(props: {
  detail: TicketDetail;
  runId: string | undefined;
  thread: {
    items: readonly ThreadItem[];
    connection: ThreadConnection;
    endStatus: string | null;
    notice: string | null;
    retry: () => void;
  };
  memory: ScrollMemory;
}) {
  const { detail, runId, thread } = props;
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

  if (runId === undefined) {
    return (
      <section aria-label="Worker thread" className="min-w-0">
        <h2 className="sr-only">Worker thread</h2>
        <EmptyState icon={Activity} title="No Worker has started">
          There is nothing to follow on this ticket yet.
        </EmptyState>
      </section>
    );
  }

  return (
    <WorkerThread
      items={thread.items}
      connection={thread.connection}
      endStatus={thread.endStatus}
      notice={thread.notice}
      pending={pending}
      onRetry={thread.retry}
      memory={props.memory}
      memoryKey={`thread:${runId}`}
      composer={live ? <SteerPanel runId={runId} /> : undefined}
    />
  );
}
