/**
 * Turns a card an engine door returned into the summary the card routes answer with.
 *
 * Why: every planning action answers `{card}` so the page can show the new phase and Needs You
 *   state without a second read. The summary needs the project's slug, the pending questions
 *   and the card's edges, all read in one transaction; the relations route and the planning
 *   routes must show the same fields, so the read lives in one place.
 *
 * Exports: replyCard().
 * Depends on: @forge/core (Card, CardSummary), services/card-view, types/routes. IO: reads storage.
 */

import type { Card, CardSummary } from '@forge/core';
import { summarizeCard, viewCard } from '#/services/card-view.js';
import type { RouteDeps } from '#/types/routes.types.js';

/** The card as the list and detail routes show it. */
export function replyCard(deps: RouteDeps, card: Card): Promise<CardSummary> {
  return deps.storage.transaction(async (tx) => {
    const slug = (await tx.projects.get(card.project))?.slug ?? card.project;

    return summarizeCard(
      await viewCard(
        tx,
        card,
        await tx.interactions.listPending(),
        await tx.cardRelations.listFor(card.id),
      ),
      slug,
    );
  });
}
