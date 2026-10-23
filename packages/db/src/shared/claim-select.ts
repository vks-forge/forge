/**
 * Chooses which card-reply rows one claim takes.
 *
 * Why: the Director has a fixed number of free slots (`max_concurrent_steps`) and may not touch a
 *   card that already has a turn in flight. A claim that marked every open row claimed would strand
 *   the rows of cards with no slot for the whole stale window, and would hand a second turn of an
 *   in-flight card to someone else. One pure chooser keeps SQLite and the in-memory queue identical
 *   (contract-tested): cards with an owner message waiting first, then the card whose oldest row is
 *   oldest, at most `maxCards` cards, every eligible row of a chosen card, returned oldest first.
 *
 * Exports: selectClaimRows().
 * Depends on: @forge/core (CardClaimOptions), types/card-claim. No IO.
 */

import type { CardClaimOptions, CardId } from '@forge/core';
import type { ClaimCandidate } from '#/types/card-claim.types.js';

/** The ids of the rows to claim out of `candidates` (any order), ascending. */
export function selectClaimRows(
  candidates: readonly ClaimCandidate[],
  options: CardClaimOptions = {},
): number[] {
  const skipped = new Set<CardId>(options.exclude ?? []);
  const cards = new Map<CardId, { first: number; owner: boolean }>();
  for (const row of candidates) {
    if (skipped.has(row.card_id)) {
      continue;
    }

    const seen = cards.get(row.card_id);
    cards.set(row.card_id, {
      first: Math.min(seen?.first ?? row.id, row.id),
      owner: (seen?.owner ?? false) || row.reason === 'user_message',
    });
  }

  const ordered = [...cards.entries()].sort(
    ([, a], [, b]) => Number(b.owner) - Number(a.owner) || a.first - b.first,
  );

  const limit = options.maxCards ?? ordered.length;
  const chosen = new Set(ordered.slice(0, Math.max(0, limit)).map(([id]) => id));

  return candidates
    .filter((row) => chosen.has(row.card_id))
    .map((row) => row.id)
    .sort((a, b) => a - b);
}
