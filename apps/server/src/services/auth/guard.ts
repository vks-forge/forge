/**
 * The access decision for one request.
 *
 * Why: every route except a few needs proof of who is calling. One function holds that rule
 *   so the router cannot forget it for a new route: a route is protected unless it says
 *   `open`, and `open` is only for `/health` (liveness, no data), the hook route (its own
 *   per-run secret) and `/auth/open` (its own one-time code). Proof is the install token (the
 *   CLI, the hooks, tests, the dev proxy) or a live browser session cookie; `bearer` routes
 *   take the token alone, because a session must not be able to mint more sign-in codes.
 *   The ticket path is open only to the SSE route and only for the run the ticket was
 *   issued for. The answer says which proof was used because a cookie is sent by the browser
 *   on its own, so the router adds a same-origin check for it (and only for it). Anything
 *   unclear is a refusal (fail closed, code.md rule 6).
 *
 * Exports: createAuthGuard().
 * Depends on: services/auth/{cookies,token}, types/auth. No IO.
 */

import { sessionIdOf } from '#/services/auth/cookies.js';
import { bearerOf, tokensEqual } from '#/services/auth/token.js';
import type {
  AuthGuard,
  AuthMethod,
  AuthRequest,
  SessionVerifier,
  SseTicketIssuer,
} from '#/types/auth.types.js';

/** A verifier that knows no session: the default, so a guard built without one stays closed. */
const NO_SESSIONS: SessionVerifier = { verify: () => false };

export function createAuthGuard(
  installToken: string,
  tickets: SseTicketIssuer,
  sessions: SessionVerifier = NO_SESSIONS,
): AuthGuard {
  const authenticate = ({
    access,
    authorization,
    ticket,
    runId,
    cookie,
  }: AuthRequest): AuthMethod | undefined => {
    if (access === 'open') {
      return 'open';
    }

    const presented = bearerOf(authorization);
    if (presented !== undefined && tokensEqual(presented, installToken)) {
      return 'bearer';
    }

    if (access === 'bearer') {
      return undefined;
    }

    const sessionId = sessionIdOf(cookie);
    if (sessionId !== undefined && sessions.verify(sessionId)) {
      return 'session';
    }

    return access === 'token_or_ticket' &&
      ticket !== null &&
      runId !== undefined &&
      tickets.verify(ticket, runId)
      ? 'ticket'
      : undefined;
  };

  return {
    authenticate,
    allows: (request) => authenticate(request) !== undefined,
  };
}
