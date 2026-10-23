/**
 * `/settings/setup-cache`: the size of Forge's setup cache and a way to clear it.
 *
 * Why: the setup cache is disk the owner did not choose to fill; the settings screen must show
 *   how much it uses and offer to give it back (Clear setup cache). By default only the copied
 *   install folders go; the shared package downloads go only when the body asks, because losing
 *   them costs every project a slow first install. Cached sizes may be up to a minute old; a
 *   clear measures fresh so the freed amount is true.
 *
 * Exports: setupCacheRoutes().
 * Depends on: node:path, schemas/setup-cache-api, services/setup-cache-admin,
 *   services/http/{body,respond}, types/routes. IO: reads and deletes under `<data home>/cache`.
 */

import { join } from 'node:path';
import { SetupCacheClearBody } from '#/schemas/setup-cache-api.js';
import { readJson } from '#/services/http/body.js';
import { sendJson } from '#/services/http/respond.js';
import { createSetupCacheAdmin } from '#/services/setup-cache-admin.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

export function setupCacheRoutes(deps: Pick<RouteDeps, 'dataHome' | 'now'>): Route[] {
  const admin = createSetupCacheAdmin({
    cacheDir: join(deps.dataHome.home, 'cache'),
    now: deps.now,
  });

  return [
    {
      method: 'GET',
      path: '/settings/setup-cache',
      async handle({ res }) {
        sendJson(res, 200, await admin.sizes());
      },
    },
    {
      method: 'POST',
      path: '/settings/setup-cache/clear',
      async handle(ctx) {
        const body = await readJson(ctx.req, SetupCacheClearBody);
        sendJson(ctx.res, 200, await admin.clear(body.include_downloads));
      },
    },
  ];
}
