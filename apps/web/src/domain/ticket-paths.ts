/**
 * URLs of ticket screens.
 *
 * Why: every ticket reference in the app is a link to its page (d-0116), so the URL shape
 *   lives in one function that the Board cards, the thread and later screens share. The
 *   page's tab is a path segment and a run to show is `?run=`, so a link can open the
 *   Worker thread of one attempt.
 *
 * Exports: ticketPath().
 * Depends on: domain/nav-entries. No IO.
 */

import { projectPath } from '#/domain/nav-entries.js';

/** `/p/<slug>/tickets/<id>`, with an optional tab segment and run (`?run=`). */
export function ticketPath(
  slug: string,
  id: string,
  tab?: string,
  runId?: string,
): string {
  const base = projectPath(slug, `tickets/${encodeURIComponent(id)}`);
  const path = tab === undefined ? base : `${base}/${tab}`;

  return runId === undefined ? path : `${path}?run=${encodeURIComponent(runId)}`;
}
