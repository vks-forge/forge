/**
 * The HTTP server: the route table, the auth guard, the Host rule and the built UI in one.
 *
 * Why: the assembly decides what the server is made of; this is where those parts become the
 *   one `node:http` server that faces the machine. The Host policy is pinned to the port the
 *   server actually bound (a page on another local port, or on a rebound DNS name, is refused
 *   before any route runs). The control room is mounted when its build exists next to this
 *   app; a checkout that has not built it serves the API alone and says so in the log, rather
 *   than failing to start a server the CLI and the hooks still need.
 *
 * Exports: createApiServer().
 * Depends on: node:http, config/entrypoints, routes/routes, services/http/{host-policy,router,
 *   static-ui}, types/{auth,http,routes}. IO: none until it listens.
 */

import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { resolveWebRoot } from '#/config/entrypoints.js';
import { buildRoutes } from '#/routes/routes.js';
import { createHostPolicy } from '#/services/http/host-policy.js';
import { createRouter } from '#/services/http/router.js';
import { createStaticUi } from '#/services/http/static-ui.js';
import type { Auth } from '#/types/auth.types.js';
import type { ApiServerOptions } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

/** Builds the (not yet listening) server for `deps`. */
export function createApiServer(
  deps: RouteDeps,
  auth: Auth,
  options: ApiServerOptions,
): Server {
  const webRoot =
    options.webRoot === undefined ? resolveWebRoot(import.meta.url) : options.webRoot;

  if (options.webRoot === undefined && !webRoot) {
    options.log('warn', 'web UI is not built (apps/web/dist/web); serving the API only');
  }

  const router = createRouter(buildRoutes(deps), auth.guard, {
    host: createHostPolicy(options.port),
    ...(webRoot ? { ui: createStaticUi(webRoot) } : {}),
  });

  return createServer((req, res) => {
    void router.dispatch(req, res);
  });
}
