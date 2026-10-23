/**
 * Fixtures for project Home tests: the Overview answer for one project and the routes Home reads.
 *
 * Why: Home draws the Overview's figures for one project next to its inbox and tickets, so
 *   several test files need the same staged server. One place keeps them describing the same
 *   world: the project's own slice of the Overview body (as the server returns it for
 *   `projects=sample-service`) with its tickets and inbox.
 *
 * Exports: scopedOverview(), homeRoutes().
 * Depends on: helpers/work-fixtures, @forge/core (type).
 */

import type { OverviewStats } from '@forge/core';
import { inboxItem, overviewBody, ticketSummary } from '#tests/helpers/work-fixtures.js';

/** The Overview answer for this one project, as the server returns it for `projects=sample-service`. */
export function scopedOverview(over: Partial<OverviewStats> = {}): OverviewStats {
  const all = overviewBody();

  return overviewBody({
    projects_included: ['sample-service'],
    spend_by_project: all.spend_by_project.slice(0, 1),
    spend_by_project_total: all.spend_by_project_total.slice(0, 1),
    projects: all.projects.slice(0, 1),
    attention: [],
    ...over,
  });
}

export function homeRoutes(stats = scopedOverview()) {
  return {
    'GET /stats/overview': { body: stats },
    'GET /projects/sample-service/tickets': {
      body: {
        items: [
          ticketSummary(),
          ticketSummary({
            id: 'SVC-5' as never,
            title: 'Rotate keys',
            state: 'review',
            needs_you: true,
          }),
          ticketSummary({ id: 'SVC-9' as never, title: 'Old work', state: 'done' }),
        ],
        nextCursor: null,
      },
    },
    'GET /projects/sample-service/inbox': {
      body: { items: [inboxItem()], nextCursor: null },
    },
    'GET /projects/sample-service/inbox/counts': {
      body: { needs_action: 1, notices: 0, unread: 1, all: 1, archived: 0 },
    },
  };
}
