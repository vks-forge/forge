/**
 * Card phase machine — the single door for card phase changes.
 *
 * Why: the Director engine, the HTTP API and the planning flow all move a card, and the
 *   phase says whether the Director may still ask questions, whether a plan awaits the
 *   owner and whether tickets may exist. If any caller wrote `phase` directly, a card could
 *   reach `approved` without a plan, or come back from `closed`. `transitionCard()` is the
 *   one pure function that holds the legal moves and the `needs_you` flag, and it returns
 *   the next fields with `phase_version` bumped so storage can compare-and-swap and a stale
 *   writer loses instead of overwriting (d-0134, code.md rule 6). Fail closed: an event not
 *   listed for a phase is refused.
 *
 * Exports: transitionCard(), CARD_MOVES.
 * Depends on: schemas/card, shared/result, types/card-phase, types/result. No IO.
 */

import type { Card, CardPhase } from '#/schemas/card.js';
import { err, ok } from '#/shared/result.js';
import type {
  CardMoveType,
  CardPhaseDelta,
  CardPhaseEvent,
  CardTransitionError,
} from '#/types/card-phase.types.js';
import type { Result } from '#/types/result.types.js';

/** Phase moves: event type to the phases it may start from and the phase it ends in. */
export const CARD_MOVES: Readonly<
  Record<CardMoveType, { from: readonly CardPhase[]; to: CardPhase }>
> = {
  start_verifying: { from: ['grilling'], to: 'verifying' },
  plan_written: { from: ['grilling', 'verifying'], to: 'plan_ready' },
  regrill: {
    from: ['verifying', 'plan_ready', 'approved', 'queued', 'in_progress'],
    to: 'grilling',
  },
  approve: { from: ['plan_ready'], to: 'approved' },
  queue: { from: ['approved'], to: 'queued' },
  start: { from: ['approved', 'queued'], to: 'in_progress' },
  complete: { from: ['in_progress'], to: 'done' },
  close: {
    from: [
      'grilling',
      'verifying',
      'plan_ready',
      'approved',
      'queued',
      'in_progress',
      'done',
    ],
    to: 'closed',
  },
};

/** Moves that end the owner's wait: nobody is asked about a card that is approved, finished or closed. */
const CLEARS_NEEDS_YOU: readonly CardMoveType[] = ['approve', 'complete', 'close'];

/** Phases where the flag can change: a closed card never needs anyone, a done one is over. */
const FLAGGABLE: readonly CardPhase[] = [
  'grilling',
  'verifying',
  'plan_ready',
  'approved',
  'queued',
  'in_progress',
];

const illegal = (
  card: Pick<Card, 'phase'>,
  event: CardPhaseEvent,
): CardTransitionError => ({
  kind: 'illegal_transition',
  phase: card.phase,
  event: event.type,
});

/**
 * The next phase fields for `event`, or why it is refused. `phase_version` goes up by one on
 * every accepted event, flag changes included, so any concurrent writer is detected.
 */
export function transitionCard(
  card: Pick<Card, 'phase' | 'phase_version' | 'needs_you'>,
  event: CardPhaseEvent,
): Result<CardPhaseDelta, CardTransitionError> {
  if (
    event.expected_version !== undefined &&
    event.expected_version !== card.phase_version
  ) {
    return err({
      kind: 'stale_version',
      expected: event.expected_version,
      actual: card.phase_version,
    });
  }

  const version = card.phase_version + 1;

  if (event.type === 'needs_you_set' || event.type === 'needs_you_cleared') {
    if (!FLAGGABLE.includes(card.phase)) {
      return err(illegal(card, event));
    }

    return ok({
      phase: card.phase,
      phase_version: version,
      needs_you: event.type === 'needs_you_set',
    });
  }

  const move = CARD_MOVES[event.type];
  if (!move.from.includes(card.phase)) {
    return err(illegal(card, event));
  }

  return ok({
    phase: move.to,
    phase_version: version,
    needs_you: CLEARS_NEEDS_YOU.includes(event.type) ? false : card.needs_you,
  });
}
