/**
 * Stub routes for the S5d Director surfaces: pipeline proposals, scorecards and finding marks.
 *
 * Why: every project screen that draws a lane or the agent roster now asks the server for the
 * Director's pending suggestions and the scorecards, so the sample server must answer both with
 * the real shapes (nothing pending, no finished tickets) instead of a 404 that would draw an error
 * on screens that have nothing to do with them. A mark has no sample ticket to land on, so it is
 * refused as the server refuses a row that is not the ticket's. Tests that care stage their own
 * bodies with `routes`, built from helpers/forge-data/proposal-data.
 *
 * Exports: directorRoutes().
 * Depends on: helpers/fetch-stub, helpers/forge-data/proposal-data.
 */

import { json, refusal } from '#tests/helpers/fetch-stub.js';
import type { Routes } from '#tests/helpers/fetch-stub.js';
import { scorecardReply } from '#tests/helpers/forge-data/proposal-data.js';

export function directorRoutes(): Routes {
  return {
    'GET /settings/projects/:slug/pipeline-proposals': () => json({ proposals: [] }),
    'GET /projects/:slug/scorecards': ({ query }) =>
      json(
        scorecardReply({
          range: query.get('range') === '30d' ? '30d' : '90d',
          agents: [],
          shapes: [],
        }),
      ),
    'PUT /tickets/:id/findings/:row/:index/mark': () =>
      refusal(404, 'finding_not_found', 'No such finding.'),
  };
}
