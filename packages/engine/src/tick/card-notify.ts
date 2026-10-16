/**
 * Card notify: tell the live views that a card's in-memory status changed.
 *
 * Why: a card's stored rows announce themselves when they commit, but "the Director is
 *   thinking" lives in engine memory (`cardDirector()`), so its changes reach the control
 *   room only if the engine says so. After a reply finishes, the card's page must refetch to
 *   see `idle` or `error`, and it should do so even when the answer wrote nothing. One small
 *   function keeps that signal in one place and costs nothing when no listener is wired.
 *
 * Exports: notifyCard().
 * Depends on: @forge/core (CardId, ProjectEventSink via deps), types/engine. Reads storage.
 */

import type { CardId } from '@forge/core';
import type { EngineDeps } from '#/types/engine.types.js';

/** Invalidates the card's detail query for its project's watchers; never throws. */
export async function notifyCard(deps: EngineDeps, cardId: CardId): Promise<void> {
  if (!deps.projectEvents) {
    return;
  }

  try {
    const slug = await deps.storage.transaction(async (tx) => {
      const card = await tx.cards.get(cardId);

      return card ? ((await tx.projects.get(card.project))?.slug ?? card.project) : null;
    });

    if (slug !== null) {
      deps.projectEvents.invalidate(slug, [['card', cardId]]);
    }
  } catch (e) {
    deps.log?.('warn', `could not notify watchers of ${cardId}`, { error: String(e) });
  }
}
