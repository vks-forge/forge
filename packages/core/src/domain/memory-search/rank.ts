/**
 * Rank boosts — the small multipliers that put the records worth reading first.
 *
 * Why: lexical scores say how well words match, not how much a record matters. The owner pins what they
 *   care about most, a pending proposal is only an inference and a superseded decision is history, and an
 *   old session outcome is stale news. Decisions and rejected approaches are constraints and must never
 *   fade with age, or a six-month-old "do not use X" would sink below newer chatter (d-0168).
 *
 * Exports: boost(), PINNED_BOOST, PENDING_BOOST, SUPERSEDED_BOOST, OUTCOME_HALF_LIFE_DAYS.
 * Depends on: types/memory-search. Pure, no IO.
 */

import type { BoostFacts } from '#/types/memory-search.types.js';

export const PINNED_BOOST = 1.15;
export const PENDING_BOOST = 0.9;
export const SUPERSEDED_BOOST = 0.6;
export const OUTCOME_HALF_LIFE_DAYS = 30;

/** `score` scaled by what the record is: pinned up, pending and superseded down, outcomes halving every 30 days. */
export function boost(score: number, f: BoostFacts): number {
  let out = score;
  if (f.pinned) {
    out *= PINNED_BOOST;
  }

  if (f.status === 'pending') {
    out *= PENDING_BOOST;
  }

  if (f.status === 'superseded') {
    out *= SUPERSEDED_BOOST;
  }

  if (f.kind === 'outcome') {
    out *= 0.5 ** (Math.max(0, f.ageDays) / OUTCOME_HALF_LIFE_DAYS);
  }

  return out;
}
