/**
 * The live facts a ticket tile shows: stage position, the run in flight, and a one-click Retry.
 *
 * Why: the owner reads the Board to see, without opening a ticket, how far each one is
 *   ("Stage 4/7 · Review and critique"), whether a Worker is running right now (run number,
 *   agent, start time) and whether a parked ticket can simply be retried. Asking per ticket
 *   would be a round trip and several reads per tile, so this reads the pipeline snapshots, stage
 *   rows, runs and pending questions of the whole page with four batch reads and rolls each ticket
 *   up in memory. The stage is the first one the core pipeline view does not show as passed, so it
 *   agrees with the Ticket page's strip by construction. The facts are absent when they do not
 *   apply (no pipeline copy yet, a finished ticket, nothing running), never invented.
 *
 * Exports: ticketProgress(), progressExtra().
 * Depends on: @forge/core (ticketPipelineView, ticket and run types), services/escalation-view.
 *   IO: reads storage inside the caller's transaction.
 */

import { ticketPipelineView } from '@forge/core';
import type { Interaction, Run, StageRun, StorageTx, Ticket } from '@forge/core';
import { escalationViews } from '#/services/escalation-view.js';
import type { TicketProgress } from '#/types/ticket-summary.types.js';

const LIVE_RUN: readonly Run['status'][] = ['starting', 'running', 'settling'];
const PASSED = new Set(['passed', 'adopted', 'skipped']);
const FINISHED: readonly Ticket['status'][] = ['done', 'cancelled'];

function groupBy<T extends { ticket_id: string }>(rows: readonly T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    out.set(row.ticket_id, [...(out.get(row.ticket_id) ?? []), row]);
  }

  return out;
}

/** The `progress` extra for `summarizeTicket`, or nothing when the ticket has none. */
export function progressExtra(
  all: ReadonlyMap<string, TicketProgress>,
  id: string,
): { progress?: TicketProgress } {
  const one = all.get(id);

  return one === undefined ? {} : { progress: one };
}

/** Progress facts per ticket id; `pending` is the caller's pending questions when it already read them. */
export async function ticketProgress(
  tx: StorageTx,
  tickets: readonly Ticket[],
  pending?: readonly Interaction[],
): Promise<Map<string, TicketProgress>> {
  const out = new Map<string, TicketProgress>();
  if (tickets.length === 0) {
    return out;
  }

  const ids = tickets.map((t) => t.id);
  const [snapshots, stageRows, runRows, allPending] = await Promise.all([
    tx.ticketPipelines.listByTickets(ids),
    tx.stageRuns.listByTickets(ids),
    tx.runs.listByTickets(ids),
    pending === undefined ? tx.interactions.listPending() : Promise.resolve(pending),
  ]);

  const stages = groupBy<StageRun>(stageRows);
  const runs = groupBy<Run>(runRows);
  const owned = new Set<string>(ids);
  const views = await escalationViews(
    tx,
    allPending.filter((i) => owned.has(i.ticket_id)),
  );

  for (const ticket of tickets) {
    const progress: { -readonly [K in keyof TicketProgress]: TicketProgress[K] } = {};
    const snapshot = snapshots.find((s) => s.ticket_id === ticket.id);
    if (snapshot && !FINISHED.includes(ticket.status)) {
      const { stages: strip } = ticketPipelineView(
        snapshot,
        stages.get(ticket.id) ?? [],
        [],
        ticket,
        [],
      );

      const at = strip.findIndex((s) => !PASSED.has(s.status));
      const current = strip[at < 0 ? strip.length - 1 : at];
      if (current) {
        progress.stage = {
          index: at < 0 ? strip.length : at + 1,
          count: strip.length,
          label: current.label,
        };
      }
    }

    const own = runs.get(ticket.id) ?? [];
    const live = own.find((r) => r.id === ticket.assignee_run_id);
    if (live && LIVE_RUN.includes(live.status)) {
      progress.liveRun = {
        number: own.indexOf(live) + 1,
        ...(live.agent_id === undefined ? {} : { agent: live.agent_id }),
        started_at: live.started_at,
      };
    }

    const retry = views.find(
      (v) => v.ticket_id === ticket.id && v.actions.includes('retry'),
    );

    if (retry) {
      progress.retryEscalationId = retry.id;
    }

    out.set(ticket.id, progress);
  }

  return out;
}
