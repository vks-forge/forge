/**
 * `/auth/*`: SSE tickets, the one-time sign-in code, the browser session and logout.
 *
 * Why: the control room runs in a browser tab, and anything a page script can read, an
 *   extension or an injected script can read too, so the page never holds the install token.
 *   Instead `forge start` / `forge open` ask `POST /auth/open-code` (install token only) for a
 *   60-second single-use code and open `/auth/open?code=...` in the browser; that route spends
 *   the code, sets an `HttpOnly` session cookie and redirects to `/`, so the code leaves the
 *   address bar at once. `POST /auth/logout` is open: it always clears the cookie and drops
 *   the session when one is valid, so a person whose session already expired can still get
 *   rid of the dead cookie (the router still demands a same-origin `Origin` of a cookie
 *   request). `POST /auth/proof` answers a challenge with an HMAC under the install token,
 *   so the CLI can check a port is really this server before it sends the token. The
 *   page's `EventSource` cannot send headers either, so `POST /auth/sse-ticket` (token or
 *   session) hands out a ticket bound to one run id (`{run_id}`) or one project slug
 *   (`{project}`) for the stream URL; it is useless for any other run or project, for the
 *   other kind of stream and for any other route. A code that fails gets a plain page, not JSON, because a
 *   person reads it, and it says what to do next.
 *
 * Exports: authRoutes().
 * Depends on: schemas/api, services/auth/cookies, services/http/{body,respond}, types/routes.
 *   IO: reads the request body, writes the response.
 */

import { ProofBody, SseTicketBody } from '#/schemas/api.js';
import {
  clearedSessionCookie,
  sessionCookie,
  sessionIdOf,
} from '#/services/auth/cookies.js';
import { readJson } from '#/services/http/body.js';
import { sendJson } from '#/services/http/respond.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

const NO_STORE = {
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
} as const;

const EXPIRED_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Forge</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem">
<h1>This sign-in link has expired</h1>
<p>Links work once and only for a minute. Run <code>forge open</code> in a terminal to get a fresh one.</p>
</body></html>`;

export function authRoutes(deps: RouteDeps): Route[] {
  return [
    {
      method: 'POST',
      path: '/auth/sse-ticket',
      async handle({ req, res }) {
        const body = await readJson(req, SseTicketBody);
        const { ticket, expiresInSeconds } =
          'run_id' in body
            ? deps.tickets.issue(body.run_id)
            : deps.tickets.issueProject(body.project);

        sendJson(res, 200, { ticket, expires_in_s: expiresInSeconds });
      },
    },
    {
      method: 'POST',
      path: '/auth/open-code',
      // The token only: a browser session must not be able to mint more sign-ins.
      access: 'bearer',
      async handle({ res }) {
        const { code, expiresInSeconds } = deps.sessions.issueCode();

        sendJson(res, 200, { code, expires_in_s: expiresInSeconds });
      },
    },
    {
      method: 'GET',
      path: '/auth/open',
      // Open because the code is the credential; the handler checks it.
      access: 'open',
      async handle({ res, url }) {
        const sessionId = deps.sessions.redeemCode(url.searchParams.get('code') ?? '');
        if (sessionId === undefined) {
          res.writeHead(401, {
            ...NO_STORE,
            'content-type': 'text/html; charset=utf-8',
            'content-security-policy':
              "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
            'content-length': Buffer.byteLength(EXPIRED_PAGE),
          });

          res.end(EXPIRED_PAGE);

          return;
        }

        // Always `/`: the code carries no destination, so there is nothing to redirect elsewhere.
        res.writeHead(302, {
          ...NO_STORE,
          location: '/',
          'set-cookie': sessionCookie(sessionId, deps.sessions.cookieMaxAgeSeconds),
        });

        res.end();
      },
    },
    {
      method: 'POST',
      path: '/auth/proof',
      // Open because the caller has no credential yet; it learns nothing but an HMAC of its
      // own nonce, and the token itself is never returned.
      access: 'open',
      async handle({ req, res }) {
        const { nonce } = await readJson(req, ProofBody);

        sendJson(res, 200, { proof: deps.prover.prove(nonce) });
      },
    },
    {
      method: 'POST',
      path: '/auth/logout',
      // Open: an expired or unknown cookie must still be clearable. The router has already
      // required a matching Origin when the request carries a session cookie.
      access: 'open',
      async handle({ req, res }) {
        const sessionId = sessionIdOf(req.headers.cookie);
        if (sessionId !== undefined) {
          deps.sessions.revoke(sessionId);
        }

        res.writeHead(204, { ...NO_STORE, 'set-cookie': clearedSessionCookie() });
        res.end();
      },
    },
  ];
}
