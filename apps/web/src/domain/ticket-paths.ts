/**
 * URLs of ticket screens.
 *
 * Why: every ticket reference in the app is a link to its page (d-0116), so the URL shape
 *   lives in one function that the Board cards, the thread and later screens share.
 *
 * Exports: ticketPath().
 * Depends on: domain/nav-entries. No IO.
 */

import { projectPath } from '#/domain/nav-entries.js';

/** `/p/<slug>/tickets/<id>`. */
export function ticketPath(slug: string, id: string): string {
  return projectPath(slug, `tickets/${encodeURIComponent(id)}`);
}
