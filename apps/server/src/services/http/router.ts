/**
 * A tiny router over `node:http`: path patterns with `:name` segments, JSON errors.
 *
 * Why: the API has six routes, which does not justify a framework dependency (d-0061).
 *   The router matches method and path, decodes path parameters, rejects a request whose
 *   Host header is not loopback (a browser page on a rebinding DNS name could otherwise
 *   reach a service that is bound to 127.0.0.1), answers 404 for unknown paths and 405
 *   with an `Allow` header for a known path with the wrong method, and turns anything a
 *   handler throws into the safe error response.
 *
 * Exports: createRouter(), isLoopbackHost().
 * Depends on: services/http/http-errors, services/http/respond, types/http. No IO of its own.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError } from '#/services/http/http-errors.js';
import { sendError } from '#/services/http/respond.js';
import type { Route, Router } from '#/types/http.types.js';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** True when a `Host` header names a loopback address (any port). */
export function isLoopbackHost(header: string | undefined): boolean {
  if (!header) {
    return false;
  }

  const host = header.startsWith('[')
    ? header.slice(0, header.indexOf(']') + 1)
    : header.split(':')[0];

  return LOOPBACK_HOSTS.has((host ?? '').toLowerCase());
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
export function createRouter(routes: readonly Route[]): Router {
  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!isLoopbackHost(req.headers.host)) {
      throw new HttpError(403, 'bad_host', 'host header must be a loopback address', {
        family: 'policy_denied',
      });
    }

    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const allowed: string[] = [];
    for (const route of routes) {
      const params = matchPath(route.path, url.pathname);
      if (!params) {
        continue;
      }

      if (route.method === req.method) {
        await route.handle({ req, res, params, url });

        return;
      }

      allowed.push(route.method);
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
