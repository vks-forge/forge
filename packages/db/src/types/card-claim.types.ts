/**
 * The row facts a card-reply claim chooses cards by.
 *
 * Why: the SQLite and in-memory queues must pick the same cards for the same options, so both
 *   hand the same minimal row shape to one shared chooser. Types only.
 *
 * Exports: ClaimCandidate.
 * Depends on: @forge/core (CardId, CardReplyReason). No IO.
 */

import type { CardId, CardReplyReason } from '@forge/core';

/** An unfinished, claimable queue row (unclaimed or claimed before the stale cutoff). */
export interface ClaimCandidate {
  readonly id: number;
  readonly card_id: CardId;
  readonly reason: CardReplyReason;
}
