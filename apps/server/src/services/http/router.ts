/**
 * A tiny router over `node:http`: path patterns with `:name` segments, JSON errors.
 *
 * Why: the API is a few dozen routes, which does not justify a framework dependency (d-0061).
 *   The router matches method and path, decodes path parameters, rejects a request whose
 *   Host header does not name this server (a browser page on a rebinding DNS name could
 *   otherwise reach a service that is bound to 127.0.0.1; a page on another local port sends
 *   the right Host, so that case is the `Origin` check plus the absence of CORS headers), asks
 *   the auth guard before any handler runs (a route needs the install token or a session
 *   unless it declares itself `open`; the guard is a required argument so a router cannot be
 *   built without one, and unknown paths also answer 401 to a caller without credentials so
 *   the route table is not probed anonymously), answers 404 for unknown paths and 405 with
 *   an `Allow` header for a known path with the wrong method, and turns anything a handler
 *   throws into the safe error response. A request that is signed in only by the browser's
 *   cookie must, unless its method is GET or HEAD, carry an `Origin` equal to the server's own
 *   (CSRF). The check is by exemption, not by a list of unsafe methods, so OPTIONS or a method
 *   added later is refused too; it runs before routing, so it also covers open routes (logout)
 *   and unknown paths, and a valid bearer token skips it because a script sets that header
 *   deliberately.
 *   The API answers under `/api/*` (the browser's view; the prefix is stripped) and at the
 *   bare paths (the CLI, the hooks, the tests). When the built UI is mounted it owns `/`:
 *   its files, and a browser navigation (GET, `Accept: text/html`, no `Authorization`) to any
 *   path that is not under `/api` gets `index.html`, so a deep link such as `/tickets/FX-1`
 *   shows the app rather than the JSON of the API route with the same name.
 *
 * Exports: createRouter(), isLoopbackHost().
 * Depends on: services/auth/cookies, services/http/{host-policy,http-errors,respond}, types/auth,
 *   types/http.
 *   No IO of its own.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sessionIdOf } from '#/services/auth/cookies.js';
import {
  createHostPolicy,
  isLoopbackHost,
  sameOrigin,
} from '#/services/http/host-policy.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendError } from '#/services/http/respond.js';
import type { AuthGuard } from '#/types/auth.types.js';
import type { Route, Router, RouterOptions } from '#/types/http.types.js';

export { isLoopbackHost };

const API_PREFIX = '/api';
/** The only methods that cannot change state; every other method is treated as unsafe. */
const SAFE_METHODS = new Set(['GET', 'HEAD']);

/** `/api/x` is `/x`; `/apix` is not under the prefix. Undefined for a path outside it. */
function stripApiPrefix(pathname: string): string | undefined {
  if (pathname === API_PREFIX) {
    return '/';
  }

  return pathname.startsWith(`${API_PREFIX}/`)
    ? pathname.slice(API_PREFIX.length)
    : undefined;
}

/** A browser asking for a page: no credentials of its own and HTML is what it wants. */
function isNavigation(req: IncomingMessage): boolean {
  return (
    (req.method === 'GET' || req.method === 'HEAD') &&
    req.headers.authorization === undefined &&
    (req.headers.accept ?? '').includes('text/html')
  );
}

/** A client-side route has no file extension; a missing `/x.js` must stay a 404. */
function looksLikePage(pathname: string): boolean {
  return !(pathname.split('/').pop() ?? '').includes('.');
}

function matchPath(pattern: string, path: string): Record<string, string> | null {
  const want = pattern.split('/');
  const have = path.split('/');
  if (want.length !== have.length) {
    return null;
  }

  const params: Record<string, string> = {};
  for (const [i, segment] of want.entries()) {
    const actual = have[i] ?? '';
    if (segment.startsWith(':')) {
      if (actual === '') {
        return null;
      }

      try {
        params[segment.slice(1)] = decodeURIComponent(actual);
      } catch {
        return null;
      }
    } else if (segment !== actual) {
      return null;
    }
  }

  return params;
}

/** Builds a router over a fixed route table. */
export function createRouter(
  routes: readonly Route[],
  guard: AuthGuard,
  options: RouterOptions = {},
): Router {
  const hostPolicy = options.host ?? createHostPolicy();
  const { ui } = options;

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!hostPolicy.allows(req.headers.host)) {
      throw new HttpError(
        403,
        'bad_host',
        'host header must name this server on a loopback address',
        { family: 'policy_denied' },
      );
    }

    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const apiPath = stripApiPrefix(url.pathname);
    const pathname = apiPath ?? url.pathname;
    const pages = apiPath === undefined ? ui : undefined;

    if (pages && (await pages.serveFile(req, res, url.pathname))) {
      return;
    }

    const authorization = req.headers.authorization;
    const cookie = req.headers.cookie;

    // The browser attaches the cookie by itself, so a request that carries ours and is not
    // GET or HEAD must come from our own page. Bearer callers set their header deliberately.
    if (
      !SAFE_METHODS.has(req.method ?? '') &&
      sessionIdOf(cookie) !== undefined &&
      !guard.allows({
        access: 'bearer',
        authorization,
        ticket: null,
        runId: undefined,
        cookie: undefined,
      }) &&
      !sameOrigin(req.headers.origin, req.headers.host)
    ) {
      throw new HttpError(403, 'bad_origin', 'origin does not match this server', {
        family: 'policy_denied',
      });
    }

    const unauthorized = (): HttpError => {
      res.setHeader('www-authenticate', 'Bearer');

      return new HttpError(401, 'unauthorized', 'unauthorized', { family: 'auth' });
    };

    const allowed: string[] = [];
    for (const route of routes) {
      const params = matchPath(route.path, pathname);
      if (!params) {
        continue;
      }

      if (route.method === req.method) {
        // A page URL that shares a name with an API route (`/tickets/FX-1`) is the page.
        if (pages && route.access !== 'open' && isNavigation(req)) {
          await pages.serveIndex(req, res);

          return;
        }

        const method = guard.authenticate({
          access: route.access ?? 'token',
          authorization,
          ticket: url.searchParams.get('ticket'),
          runId: params['id'],
          cookie,
        });

        if (method === undefined) {
          throw unauthorized();
        }

        await route.handle({ req, res, params, url });

        return;
      }

      allowed.push(route.method);
    }

    if (pages && isNavigation(req) && looksLikePage(pathname)) {
      await pages.serveIndex(req, res);

      return;
    }

    const known = guard.allows({
      access: 'token',
      authorization,
      ticket: null,
      runId: undefined,
      cookie,
    });

    if (!known) {
      throw unauthorized();
    }

    if (allowed.length > 0) {
      res.setHeader('allow', allowed.join(', '));

      throw new HttpError(
        405,
        'method_not_allowed',
        `${req.method ?? ''} is not allowed here`,
      );
    }

    throw new HttpError(404, 'not_found', 'no such route');
  }

  return {
    async dispatch(req, res) {
      try {
        await handle(req, res);
      } catch (error) {
        // A request body we refused to read must not keep the connection alive.
        if (!res.headersSent) {
          res.setHeader('connection', 'close');
        }

        sendError(res, error);
      }
    },
  };
}
