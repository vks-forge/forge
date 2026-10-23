/**
 * Reason and wait inference for history entries, from neighbouring stored facts only.
 *
 * Why: older tickets and some engine moves stored a status change with no reason. The owner still
 *   asks "why did it move?", and the answer is usually stored next to it: the question settled at
 *   the same moment, the wake that started the run, the run that just ended. Reading those
 *   neighbours gives an honest reason; when none is there the entry stays plain, because a guessed
 *   reason would be worse than none.
 *
 * Exports: inferReason(), waitBeforeRun().
 * Depends on: domain/history-copy, schemas/card-event, types/history. No IO.
 */

import {
  ESCALATION_ACTION_COPY,
  RUN_END_COPY,
  WAKE_KIND_COPY,
  formatDuration,
} from '#/domain/history-copy.js';
import type { Run } from '#/schemas/run.js';
import type { TicketStatus } from '#/schemas/ticket.js';
import type { TicketHistoryFacts } from '#/types/history.types.js';

/** Facts this close to a move (in time) belong to it. */
const NEAR_MS = 2000;
/** A Worker starts a little after the move to In progress; allow for that gap. */
const START_GAP_MS = 10_000;

/** Shorter waits are the normal tick delay and not worth a line of their own. */
export const WAIT_NOTE_MS = 30_000;

const ms = (iso: string): number => Date.parse(iso);

/** The best stored reason for a move at `at` from `from` to `to`, or undefined when nothing stored explains it. */
export function inferReason(
  facts: TicketHistoryFacts,
  at: string,
  from: TicketStatus,
  to: TicketStatus,
): string | undefined {
  const t = ms(at);

  const settled = facts.events.find(
    (e) =>
      e.kind === 'escalation_settled' &&
      e.payload.ticket_id === facts.ticketId &&
      Math.abs(ms(e.at) - t) <= NEAR_MS,
  );

  if (settled?.kind === 'escalation_settled') {
    const who = settled.payload.by === 'owner' ? 'You' : 'Forge';
    const said = ESCALATION_ACTION_COPY[settled.payload.action];

    return `${who} ${said}`;
  }

  if (to === 'in_progress') {
    const run = facts.runs.find(
      (r) => ms(r.started_at) >= t - NEAR_MS && ms(r.started_at) <= t + START_GAP_MS,
    );

    if (run?.retry_of !== undefined) {
      return 'Retrying after the last run failed';
    }

    const wake = [...facts.wakes]
      .filter((w) => w.consumed_at !== undefined && ms(w.consumed_at) <= t + START_GAP_MS)
      .filter((w) => run === undefined || ms(w.created_at) <= ms(run.started_at))
      .sort((a, b) => ms(b.created_at) - ms(a.created_at))[0];

    if (
      wake !== undefined &&
      t - ms(wake.consumed_at ?? wake.created_at) <= START_GAP_MS
    ) {
      return `Started again because ${WAKE_KIND_COPY[wake.kind]}`;
    }

    return undefined;
  }

  if (from === 'in_progress' || from === 'verifying') {
    const run = facts.runs.find(
      (r) => r.ended_at !== undefined && Math.abs(ms(r.ended_at) - t) <= NEAR_MS * 2,
    );

    const said = run === undefined ? undefined : RUN_END_COPY[run.status];
    if (said !== undefined) {
      return said.charAt(0).toUpperCase() + said.slice(1);
    }
  }

  const stage = facts.stageRuns.find(
    (s) => s.ended_at !== undefined && Math.abs(ms(s.ended_at) - t) <= NEAR_MS,
  );

  const note = stage?.outcome.note ?? stage?.outcome.review?.summary;
  if (note !== undefined && (to === 'review' || to === 'waiting_human')) {
    return note;
  }

  return undefined;
}

/** How long the ticket waited before `run` started, and who held the slot, when stored facts say. */
export function waitBeforeRun(
  facts: TicketHistoryFacts,
  run: Run,
): { waited_ms: number; text: string } | undefined {
  const start = ms(run.started_at);
  const wake = [...facts.wakes]
    .filter((w) => ms(w.not_before ?? w.created_at) <= start)
    .sort(
      (a, b) => ms(b.not_before ?? b.created_at) - ms(a.not_before ?? a.created_at),
    )[0];

  if (wake === undefined) {
    return undefined;
  }

  const from = ms(wake.not_before ?? wake.created_at);
  const waited = start - from;
  if (waited < WAIT_NOTE_MS) {
    return undefined;
  }

  const holder = (facts.otherRuns ?? []).find(
    (o) =>
      ms(o.started_at) <= start && (o.ended_at === undefined || ms(o.ended_at) >= from),
  );

  const length = formatDuration(waited);

  return {
    waited_ms: waited,
    text:
      holder === undefined
        ? `Waited ${length} before a Worker started`
        : `Waited ${length} for a Worker slot (${holder.ticket_id} had it)`,
  };
}
