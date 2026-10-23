/**
 * ConversationTab: the Worker's live thread of one run, with the steer box docked under it.
 *
 * Why: this is where a person watches a Worker think and act and, while the run is live,
 *   redirects it (d-0109). The thread scrolls above a "Message the Worker" box that stays at the
 *   bottom of the screen; the box exists only for the run the ticket is working on right now and
 *   only while it is live, so a finished or past run is a read-only record. Everything waiting on
 *   the owner is in the needs-you modal the alert under the title opens; the page passes in the
 *   status lines that go with it, drawn above that box whether or not the run is live. Choosing another run (Runs tab, `?run=`) replays that
 *   run's thread. A run's end is said as "Worker run 3 finished / was stopped / failed". A ticket no Worker has touched says so.
 *
 * Exports: ConversationTab.
 * Depends on: react, lucide-react, components/thread/*, components/ui/empty-state,
 *   domain/run-status, domain/ticket-status-copy, routes/ticket/steer-panel, schemas/tickets (type), types/*.
 */

import { Activity } from 'lucide-react';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { WorkerThread } from '#/components/thread/worker-thread.js';
import { EmptyState } from '#/components/ui/empty-state.js';
import { isRunLive } from '#/domain/run-status.js';
import { runEndWords, runOrdinal } from '#/domain/ticket-status-copy.js';
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
  /** The status lines of what the owner just settled or sent, drawn above the steer box (or at the foot when there is none). */
  dock: () => ReactNode;
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
      <section
        aria-label="Worker thread"
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <h2 className="sr-only">Worker thread</h2>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <EmptyState icon={Activity} title="No Worker has started">
            There is nothing to follow on this ticket yet.
          </EmptyState>
        </div>
        {props.dock()}
      </section>
    );
  }

  return (
    <WorkerThread
      items={thread.items}
      connection={thread.connection}
      endStatus={thread.endStatus}
      endLabel={runEndWords(thread.endStatus, runOrdinal(detail.runs, runId))}
      notice={thread.notice}
      pending={pending}
      onRetry={thread.retry}
      memory={props.memory}
      memoryKey={`thread:${runId}`}
      composer={
        <>
          {props.dock()}
          {live ? <SteerPanel runId={runId} /> : null}
        </>
      }
    />
  );
}
