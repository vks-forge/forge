/**
 * URLs of card screens.
 *
 * Why: a card is referenced from the Board, from a ticket that came out of it and from the
 *   Director's intake reply; every one is a link to the Card page (d-0105), so the URL shape
 *   lives in one function, like `ticketPath()`. The page's tab is a path segment
 *   (`/cards/FX-C2/plan`), so a link can open a specific view.
 *
 * Exports: cardPath().
 * Depends on: domain/nav-entries. No IO.
 */

import { projectPath } from '#/domain/nav-entries.js';

/** `/p/<slug>/cards/<id>`, with an optional tab segment (`conversation`, `plan`, ...). */
export function cardPath(slug: string, id: string, tab?: string): string {
  const base = projectPath(slug, `cards/${encodeURIComponent(id)}`);

  return tab === undefined ? base : `${base}/${tab}`;
}
