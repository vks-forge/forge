/**
 * Signed, short-lived tickets for server-sent event streams.
 *
 * Why: the control room watches a run with the browser's `EventSource`, which cannot send
 *   an `Authorization` header, and putting the install token itself in a URL would leak it
 *   into history and logs. Instead the page asks `POST /auth/sse-ticket` (with the token)
 *   for a ticket bound to one run id that expires in 60 seconds; the ticket is
 *   `<expiry>.<hmac>` signed with a per-process random key, so a restart invalidates every
 *   ticket. It stays valid until expiry (not single use) because `EventSource` reconnects
 *   with the same URL after a dropped connection.
 *
 * Exports: SSE_TICKET_TTL_SECONDS, createSseTicketIssuer().
 * Depends on: node:crypto, services/auth/token, types/auth. No IO.
 */

import { createHmac, randomBytes } from 'node:crypto';
import { tokensEqual } from '#/services/auth/token.js';
import type { SseTicketIssuer } from '#/types/auth.types.js';

export const SSE_TICKET_TTL_SECONDS = 60;

/** Builds an issuer; `key` and `now` are injectable for tests. */
export function createSseTicketIssuer(
  now: () => number,
  key: Buffer = randomBytes(32),
): SseTicketIssuer {
  const sign = (runId: string, expiresAt: number): string =>
    createHmac('sha256', key).update(`sse:${runId}:${expiresAt}`).digest('base64url');

  return {
    issue(runId) {
      const expiresAt = now() + SSE_TICKET_TTL_SECONDS * 1000;

      return {
        ticket: `${expiresAt}.${sign(runId, expiresAt)}`,
        expiresInSeconds: SSE_TICKET_TTL_SECONDS,
      };
    },
    verify(ticket, runId) {
      const [expiry, signature, ...extra] = ticket.split('.');
      const expiresAt = Number(expiry);
      if (!signature || extra.length > 0 || !Number.isSafeInteger(expiresAt)) {
        return false;
      }

      return expiresAt > now() && tokensEqual(signature, sign(runId, expiresAt));
    },
  };
}
