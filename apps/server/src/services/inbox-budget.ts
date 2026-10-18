/**
 * The Inbox items of a card's budget warnings.
 *
 * Why: a card's spend (Director steps and ticket runs) that reaches 80 percent of its cap, or the cap itself,
 *   writes one `budget_warning` event on the card (d-0143). The owner must hear it where they look, but it must
 *   never stop anything: it is one Inbox item per threshold, `budget_warning:<card id>:<threshold>`, that needs
 *   the owner's attention and is dated by when the warning was written. Acknowledge is the Inbox's own archive
 *   mark; changing the cap is `PATCH /cards/:id`. A cap the owner changed makes an older warning moot, so an
 *   item shows only while its cap is the card's current one (a card with no cap of its own uses the Director's
 *   warning level, which a stored event cannot be compared with, so its warnings stay until archived). Cards
 *   that are done or closed show nothing. Derived from the events on every read, never copied.
 *
 * Exports: budgetWarningItems().
 * Depends on: @forge/core (inboxItemId, InboxCandidate, Card). IO: reads storage.
 */

import { inboxItemId } from '@forge/core';
import type { Card, InboxCandidate, StorageTx } from '@forge/core';

const PAGE = 200;
const SHOWN_PHASES = new Set([
  'grilling',
  'verifying',
  'plan_ready',
  'approved',
  'queued',
  'in_progress',
]);

const money = (usd: number): string => `$${usd.toFixed(2)}`;

async function latestWarnings(tx: StorageTx, card: Card) {
  const latest = new Map<number, { at: string; spent: number; cap: number }>();
  let afterSeq: number | undefined;
  for (;;) {
    const page = await tx.cardEvents.list(card.id, {
      ...(afterSeq === undefined ? {} : { afterSeq }),
      limit: PAGE,
    });

    for (const e of page) {
      if (e.kind === 'budget_warning') {
        latest.set(e.payload.threshold, {
          at: e.at,
          spent: e.payload.spent_usd,
          cap: e.payload.cap_usd,
        });
      }
    }

    const last = page[page.length - 1];
    if (page.length < PAGE || !last) {
      return latest;
    }

    afterSeq = last.seq;
  }
}

/** One needs-action item per budget warning of the project's open cards, for the cap in force. */
export async function budgetWarningItems(
  tx: StorageTx,
  projectId: string,
  slug: string,
): Promise<InboxCandidate[]> {
  const items: InboxCandidate[] = [];
  let after: { updated_at: string; id: string } | undefined;
  for (;;) {
    const page = await tx.cards.listByProject(projectId, {
      limit: PAGE,
      ...(after === undefined ? {} : { after }),
    });

    for (const card of page) {
      if (card.closed_reason !== undefined || !SHOWN_PHASES.has(card.phase)) {
        continue;
      }

      for (const [threshold, w] of await latestWarnings(tx, card)) {
        if (card.budget_cap_usd !== undefined && w.cap !== card.budget_cap_usd) {
          continue;
        }

        items.push({
          id: inboxItemId('budget_warning', `${card.id}:${threshold}`),
          kind: 'budget_warning',
          project: slug,
          title: `Card ${card.title} reached ${Math.round(threshold * 100)}% of its budget`,
          detail: `${money(w.spent)} of ${money(w.cap)}`,
          needs_action: true,
          updated_at: w.at,
        });
      }
    }

    const last = page[page.length - 1];
    if (page.length < PAGE || !last) {
      return items;
    }

    after = { updated_at: last.updated_at, id: last.id };
  }
}
