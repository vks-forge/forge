/**
 * The access decision for one request.
 *
 * Why: every route except two needs the install token. One function holds that rule so the
 *   router cannot forget it for a new route: a route is protected unless it says `open`,
 *   and `open` is only for `/health` (liveness, no data) and the hook route (which checks
 *   its own per-run secret). The ticket path is open only to the SSE route and only for the
 *   run the ticket was issued for. Anything unclear is a refusal (fail closed, code.md rule 6).
 *
 * Exports: createAuthGuard().
 * Depends on: services/auth/token, types/auth. No IO.
 */

import { bearerOf, tokensEqual } from '#/services/auth/token.js';
import type { AuthGuard, SseTicketIssuer } from '#/types/auth.types.js';

export function createAuthGuard(
  installToken: string,
  tickets: SseTicketIssuer,
): AuthGuard {
  return {
    allows({ access, authorization, ticket, runId }) {
      if (access === 'open') {
        return true;
      }

      const presented = bearerOf(authorization);
      if (presented !== undefined && tokensEqual(presented, installToken)) {
        return true;
      }

      return (
        access === 'token_or_ticket' &&
        ticket !== null &&
        runId !== undefined &&
        tickets.verify(ticket, runId)
      );
    },
  };
}
