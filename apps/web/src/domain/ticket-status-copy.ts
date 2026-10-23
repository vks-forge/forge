/**
 * Ticket status copy: what a ticket still waits on, how a finished ticket says how it ended, and
 * how a Worker run says it is over.
 *
 * Why: a finished thing must never show a present-tense wait. The server sends `open_blockers`
 *   (the tickets a ticket still waits for, by the scheduler's own rule), so a done ticket no
 *   longer reads "Waiting on FR-5" because it once depended on it; `blocked_by` is the full
 *   "Depends on" list. A cancelled ticket used to show "Run ended (success)" beside "Failed,
 *   round 4": one run's last word read as the ticket's. Now a terminal ticket leads with one
 *   outcome sentence ("Ticket cancelled at 07:01", "Merged at ..."), its pipeline stages read as
 *   history ("Last check: did not pass (round 4)"), and a run's end is "Worker run 3 finished /
 *   was stopped / failed", never "success".
 *
 * Exports: openBlockersOf(), isTerminalTicket(), outcomeLine(), runEndWords(), runOrdinal(),
 *   stageHistoryWords().
 * Depends on: @forge/core (TERMINAL_STATUSES), domain/format-time, schemas/tickets,
 *   schemas/pipelines (types). No IO.
 */

import { TERMINAL_STATUSES } from '@forge/core';
import type { Ticket } from '@forge/core';
import { formatWhen } from '#/domain/format-time.js';
import type { StageView } from '#/schemas/pipelines.js';
import type { TicketDetail } from '#/schemas/tickets.js';

/** True for done and cancelled: nothing more will happen to the ticket. */
export function isTerminalTicket(status: Ticket['status']): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * The tickets this one still waits for. The server's `open_blockers` when it sends them; a server
 * that predates them gets the old list for an open ticket and nothing for a finished one.
 */
export function openBlockersOf(
  detail: Pick<TicketDetail, 'ticket' | 'open_blockers'>,
): readonly string[] {
  if (detail.open_blockers !== undefined) {
    return detail.open_blockers;
  }

  return isTerminalTicket(detail.ticket.status) ? [] : detail.ticket.blocked_by;
}

/** The time of day (or date and time) the ticket last changed, for the outcome sentence. */
function clock(iso: string): string {
  return formatWhen(iso);
}

/** "Ticket cancelled at ..." / "Merged at ..." for a finished ticket; null while it is open. */
export function outcomeLine(
  ticket: Pick<Ticket, 'status' | 'updated_at'>,
): string | null {
  if (ticket.status === 'cancelled') {
    return `Ticket cancelled at ${clock(ticket.updated_at)}. Nothing from it was merged.`;
  }

  if (ticket.status === 'done') {
    return `Merged at ${clock(ticket.updated_at)}.`;
  }

  return null;
}

/** "Worker run 3 finished": a run's own end in plain words, never "success". */
export function runEndWords(status: string | null, ordinal: number | undefined): string {
  const name = ordinal === undefined ? 'Worker run' : `Worker run ${ordinal}`;

  switch (status) {
    case 'success':
    case 'settled':
      return `${name} finished`;
    case 'cancelled':
    case 'interrupted':
      return `${name} was stopped`;
    case 'error':
    case 'refused':
    case 'max_turns':
    case 'timeout':
      return `${name} failed`;
    default:
      return `${name} ended`;
  }
}

/** The run's place among the ticket's runs (oldest is 1), or undefined when the run is not in the list. */
export function runOrdinal(
  runs: readonly { id: string; started_at: string }[],
  runId: string | undefined,
): number | undefined {
  const sorted = [...runs].sort((a, b) => a.started_at.localeCompare(b.started_at));
  const index = sorted.findIndex((run) => run.id === runId);

  return index < 0 ? undefined : index + 1;
}

/** A stage of a finished ticket as history: what it last was, with the round it reached. */
export function stageHistoryWords(stage: Pick<StageView, 'status' | 'cycle'>): string {
  const round = stage.cycle > 0 ? ` (round ${stage.cycle + 1})` : '';

  switch (stage.status) {
    case 'passed':
    case 'adopted':
      return `Last check: passed${round}`;
    case 'failed':
      return `Last check: did not pass${round}`;
    case 'error':
      return `Last check: could not run${round}`;
    case 'skipped':
      return 'Skipped';
    default:
      return 'Did not run before the ticket ended';
  }
}
