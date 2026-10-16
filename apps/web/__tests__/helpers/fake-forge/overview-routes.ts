/**
 * Stub route for the cross-project Overview in the sample server.
 *
 * Why: `/` now opens the Overview, so every shell test that lands on it needs a server answer
 *   for `GET /stats/overview`. One fixed, well-formed answer keeps those tests about the
 *   shell; the Overview's own tests stage their own bodies.
 *
 * Exports: overviewRoutes().
 * Depends on: helpers/fetch-stub, helpers/work-fixtures.
 */

import { json } from '#tests/helpers/fetch-stub.js';
import type { Routes } from '#tests/helpers/fetch-stub.js';
import { overviewBody } from '#tests/helpers/work-fixtures.js';

export function overviewRoutes(): Routes {
  return { 'GET /stats/overview': () => json(overviewBody()) };
}
