/**
 * Card phase events, the delta they produce and why they are refused.
 *
 * Why: the Director engine, the HTTP API and the planning flow all move a card through its
 *   phases (grilling to done), and a card's phase decides what the owner sees and what the
 *   Director may do next (tickets only after approval). Every caller states what happened
 *   as one of these events and gets back the next phase fields or a typed refusal, so a lost
 *   compare-and-swap race (retry) can be told from an illegal move (a bug), the same split
 *   `transition()` makes for tickets (d-0134, code.md rule 6).
 *
 * Exports: CardPhaseEvent, CardMoveType, CardPhaseDelta, CardTransitionError.
 * Depends on: schemas/card. Types only.
 */

import type { Card, CardPhase } from '#/schemas/card.js';

interface EventBase {
  /** CAS: the `phase_version` the caller read; a different stored version is refused. */
  readonly expected_version?: number;
}

/** Every event that can move a card or flip its `needs_you` flag. */
export type CardPhaseEvent =
  | (EventBase & { type: 'start_verifying' })
  | (EventBase & { type: 'plan_written' })
  | (EventBase & { type: 'regrill' })
  | (EventBase & { type: 'approve' })
  | (EventBase & { type: 'queue' })
  | (EventBase & { type: 'start' })
  | (EventBase & { type: 'complete' })
  | (EventBase & { type: 'resume_work' })
  | (EventBase & { type: 'close' })
  | (EventBase & { type: 'needs_you_set' })
  | (EventBase & { type: 'needs_you_cleared' });

/** The fields an accepted event changes; storage writes them with a CAS on the old `phase_version`. */
export type CardPhaseDelta = Pick<Card, 'phase' | 'phase_version' | 'needs_you'>;

/** Why an event was refused. */
export type CardTransitionError =
  | { kind: 'illegal_transition'; phase: CardPhase; event: CardPhaseEvent['type'] }
  | { kind: 'stale_version'; expected: number; actual: number };

/** The events that change the phase, as opposed to those that only flip `needs_you`. */
export type CardMoveType = Exclude<
  CardPhaseEvent['type'],
  'needs_you_set' | 'needs_you_cleared'
>;
