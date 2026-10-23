/**
 * Tile progress: the short words a Board tile uses for stage, live run and card roll-up.
 *
 * Why: the owner scans the Board to see what is moving, what is stuck and what waits for them
 *   without opening anything. A ticket tile says which stage of its pipeline it is at ("Stage 4/7 ·
 *   Review and critique") and, while a Worker runs, "run 2 · implementer · 10m 03s"; a card tile
 *   says how its tickets stand ("4 of 11 done · 2 running · 1 waiting for you"). The words live in
 *   one pure file so the tile, its tooltip and the tests agree. A fact the server did not send is
 *   left out, never guessed (an older server sends no counts, so the card tile keeps its old line).
 *
 * Exports: formatElapsed(), stageText(), runText(), cardRollup().
 * Depends on: @forge/core (types), schemas/cards (type). No IO.
 */

import type { TicketLiveRun, TicketStageProgress } from '@forge/core';
import type { CardSummary } from '#/schemas/cards.js';

const pad = (n: number): string => String(n).padStart(2, '0');

/** "45s", "10m 03s", "1h 02m": whole seconds, the unit a person counts a run in. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (hours > 0) {
    return `${hours}h ${pad(minutes)}m`;
  }

  return minutes > 0 ? `${minutes}m ${pad(seconds)}s` : `${seconds}s`;
}

/** "Stage 4/7 · Review and critique". */
export function stageText(stage: TicketStageProgress): string {
  return `Stage ${stage.index}/${stage.count} · ${stage.label}`;
}

/** "run 2 · implementer"; the caller appends the elapsed time while it ticks. */
export function runText(run: TicketLiveRun): string {
  return run.agent === undefined
    ? `run ${run.number}`
    : `run ${run.number} · ${run.agent}`;
}

/**
 * "4 of 11 done · 2 running · 1 waiting for you" (plus "n cancelled" when any). Null when the card
 * has no tickets or the server sent no running / waiting counts.
 */
export function cardRollup(
  card: Pick<CardSummary, 'ticket_count' | 'tickets_done'> &
    Partial<
      Pick<CardSummary, 'tickets_cancelled' | 'tickets_running' | 'tickets_waiting_you'>
    >,
): string | null {
  if (
    card.ticket_count === 0 ||
    (card.tickets_running === undefined && card.tickets_waiting_you === undefined)
  ) {
    return null;
  }

  const parts = [`${card.tickets_done} of ${card.ticket_count} done`];
  if ((card.tickets_running ?? 0) > 0) {
    parts.push(`${card.tickets_running} running`);
  }

  if ((card.tickets_waiting_you ?? 0) > 0) {
    parts.push(`${card.tickets_waiting_you} waiting for you`);
  }

  if ((card.tickets_cancelled ?? 0) > 0) {
    parts.push(`${card.tickets_cancelled} cancelled`);
  }

  return parts.join(' · ');
}
