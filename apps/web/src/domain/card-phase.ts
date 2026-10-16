/**
 * Card phase: the words for where a card is in its life, and the dependency chips of a card.
 *
 * Why: a card now moves through phases the user can act on (the Director grilling, verifying,
 *   a plan waiting for approval) that the five Board columns cannot tell apart, so the card
 *   face says the phase in a word, next to the column that rolled it up. Dependencies decide
 *   when a card can start, so the face lists what a card waits for ("Blocked by") and what
 *   waits for it ("Blocks") by id, with a cap so a card with many links stays one tile.
 *   A card from a server that sends no phase says nothing rather than something made up.
 *
 * Exports: PHASE_LABEL, phaseLabel(), phaseLine(), dependencyChips(), MAX_CHIPS.
 * Depends on: schemas/cards (types), types/cards-ui.types. No IO.
 */

import type { CardPhase, CardSummary } from '#/schemas/cards.js';
import type { DependencyChip } from '#/types/cards-ui.types.js';

export const PHASE_LABEL: Readonly<Record<CardPhase, string>> = {
  grilling: 'Grilling',
  verifying: 'Verifying',
  plan_ready: 'Plan ready',
  approved: 'Approved',
  queued: 'Queued',
  in_progress: 'In progress',
  done: 'Done',
  closed: 'Closed',
};

/**
 * The phase line of a card face: the phase with the one number that matters in it ("Grilling ·
 * 3 open points", "Plan v2 ready", "4/7 tickets"). A number the server did not send is left
 * out, never guessed. Null when the server sent no phase.
 */
export function phaseLine(
  card: Pick<
    CardSummary,
    'phase' | 'open_points' | 'plan_version' | 'ticket_count' | 'tickets_done'
  >,
): string | null {
  const { phase } = card;
  if (phase === undefined) {
    return null;
  }

  if (phase === 'grilling' && card.open_points !== undefined && card.open_points > 0) {
    return `Grilling · ${card.open_points} open point${card.open_points === 1 ? '' : 's'}`;
  }

  if (phase === 'plan_ready' && card.plan_version !== undefined) {
    return `Plan v${card.plan_version} ready`;
  }

  if (phase === 'in_progress' && card.ticket_count > 0) {
    return `${card.tickets_done}/${card.ticket_count} tickets`;
  }

  return PHASE_LABEL[phase];
}

/** Chips shown per direction before "+n more". */
export const MAX_CHIPS = 3;

/** The phase in words, or null when the server did not send one. */
export function phaseLabel(card: Pick<CardSummary, 'phase'>): string | null {
  return card.phase === undefined ? null : PHASE_LABEL[card.phase];
}

/** One chip per direction and id, capped; the overflow is one "+n more" chip per direction. */
export function dependencyChips(
  card: Pick<CardSummary, 'depends_on' | 'blocks'>,
): readonly DependencyChip[] {
  const chips: DependencyChip[] = [];

  for (const [direction, ids] of [
    ['blocked_by', card.depends_on],
    ['blocks', card.blocks],
  ] as const) {
    for (const id of ids.slice(0, MAX_CHIPS)) {
      chips.push({ key: `${direction}:${id}`, direction, id });
    }

    if (ids.length > MAX_CHIPS) {
      chips.push({
        key: `${direction}:more`,
        direction,
        id: null,
        more: ids.length - MAX_CHIPS,
      });
    }
  }

  return chips;
}
