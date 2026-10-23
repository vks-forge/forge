/**
 * Needs-you views: the items the Card page reads from its detail.
 *
 * Why: the dock above the composer must show what waits on the owner whatever slice of
 *   history the browser loaded. Core decides what counts (`cardNeedsYouItems`); this reads what
 *   only storage knows: the card's newest events, paged back until the raise is either found
 *   or settled (a long chat can bury it), and the pending escalations of the card's tickets.
 *   A card that does not flag itself reads no history at all, so the Board and the detail of an
 *   idle card stay cheap.
 *
 * Exports: cardNeedsYouDetail().
 * Depends on: @forge/core (needs-you rules, storage tx), services/escalation-view. IO: reads storage
 *   inside the caller's transaction.
 */

import { cardNeedsYouItems, scanNeedsYou } from '@forge/core';
import type { Card, NeedsYouItem, RaiseScan, StorageTx } from '@forge/core';
import { escalationViews } from '#/services/escalation-view.js';

/** Events read per step while looking for the card's open raise. */
const SCAN_PAGE = 100;

/** Reads history newest first, a page at a time, until the raise is found or settled or history ends. */
async function scanHistory(tx: StorageTx, card: Card): Promise<RaiseScan> {
  let before: number | undefined;
  for (;;) {
    const page = await tx.cardEvents.list(card.id, {
      order: 'desc',
      limit: SCAN_PAGE,
      ...(before === undefined ? {} : { beforeSeq: before }),
    });

    const scan = scanNeedsYou(page);
    if (scan.state !== 'unknown' || page.length < SCAN_PAGE) {
      return scan;
    }

    before = page[page.length - 1]?.seq;
  }
}

/** The card's current needs-you items: its own raise, then the escalations waiting on the owner. */
export async function cardNeedsYouDetail(
  tx: StorageTx,
  card: Card,
): Promise<NeedsYouItem[]> {
  if (card.closed_reason !== undefined) {
    return [];
  }

  const scan: RaiseScan = card.needs_you
    ? await scanHistory(tx, card)
    : { state: 'unknown' };

  const pending = await tx.interactions.listPendingByCard(card.id);

  return cardNeedsYouItems({
    card,
    scan,
    escalations: await escalationViews(tx, pending),
  });
}
