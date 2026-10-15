/**
 * Browser sessions and the one-time codes that start them.
 *
 * Why: `forge start` opens the control room in the user's browser, and the browser must end
 *   up signed in without the install token ever passing through page JavaScript or a URL that
 *   lives on. The CLI (which holds the token) asks for a code, the browser trades the code
 *   once for a session cookie, and the code is dead. A code lives 60 seconds and is spent by
 *   the first attempt that names it, so a leaked link (history, a screenshot) is worthless
 *   seconds later; there are never more than a few outstanding, and a guess is compared
 *   against every one of them in constant time. A session id is 256 random bits and only its
 *   hash is kept, so a memory dump does not hand out live cookies. A session expires after
 *   12 hours idle (each use slides it) and after 7 days at most, and the table is capped so a
 *   caller with the token cannot grow it without bound. Nothing is persisted: a server
 *   restart signs every browser out, and the page tells the user to run `forge open`.
 *
 * Exports: CODE_TTL_SECONDS, SESSION_IDLE_SECONDS, SESSION_MAX_SECONDS, MAX_OPEN_CODES,
 *   MAX_SESSIONS, createSessionStore().
 * Depends on: node:crypto, services/auth/token, types/auth. No IO.
 */

import { createHash, randomBytes } from 'node:crypto';
import { tokensEqual } from '#/services/auth/token.js';
import type { SessionRecord, SessionStore } from '#/types/auth.types.js';

export const CODE_TTL_SECONDS = 60;
export const SESSION_IDLE_SECONDS = 12 * 60 * 60;
export const SESSION_MAX_SECONDS = 7 * 24 * 60 * 60;
export const MAX_OPEN_CODES = 8;
export const MAX_SESSIONS = 64;

/** Longer than any code or cookie we mint; anything longer is refused before it is compared. */
const MAX_PRESENTED_LENGTH = 200;

const hashOf = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

/** Removes the oldest entry of a map (insertion order). */
function dropOldest(map: Map<string, unknown>): void {
  const oldest = map.keys().next();
  if (!oldest.done) {
    map.delete(oldest.value);
  }
}

/** Builds a store; `now` and `random` are injectable for tests. */
export function createSessionStore(
  now: () => number,
  random: () => string = () => randomBytes(32).toString('base64url'),
): SessionStore {
  const codes = new Map<string, number>();
  const sessions = new Map<string, SessionRecord>();

  const dropExpired = (): void => {
    const at = now();
    for (const [code, expiresAt] of codes) {
      if (expiresAt <= at) {
        codes.delete(code);
      }
    }

    for (const [key, session] of sessions) {
      if (session.idleUntil <= at || session.hardUntil <= at) {
        sessions.delete(key);
      }
    }
  };

  return {
    cookieMaxAgeSeconds: SESSION_MAX_SECONDS,
    issueCode() {
      dropExpired();
      // The oldest goes first: a caller that keeps asking only cycles its own codes.
      while (codes.size >= MAX_OPEN_CODES) {
        dropOldest(codes);
      }

      const code = random();
      codes.set(code, now() + CODE_TTL_SECONDS * 1000);

      return { code, expiresInSeconds: CODE_TTL_SECONDS };
    },
    redeemCode(code) {
      if (code === '' || code.length > MAX_PRESENTED_LENGTH) {
        return undefined;
      }

      // No early exit: how long this takes must not say which stored code was close.
      let match: string | undefined;
      for (const stored of codes.keys()) {
        if (tokensEqual(code, stored)) {
          match = stored;
        }
      }

      if (match === undefined) {
        return undefined;
      }

      const expiresAt = codes.get(match) ?? 0;
      codes.delete(match);
      if (expiresAt <= now()) {
        return undefined;
      }

      dropExpired();
      while (sessions.size >= MAX_SESSIONS) {
        dropOldest(sessions);
      }

      const id = random();
      const at = now();
      sessions.set(hashOf(id), {
        idleUntil: at + SESSION_IDLE_SECONDS * 1000,
        hardUntil: at + SESSION_MAX_SECONDS * 1000,
      });

      return id;
    },
    verify(sessionId) {
      if (sessionId === '' || sessionId.length > MAX_PRESENTED_LENGTH) {
        return false;
      }

      // Keyed by hash: the lookup compares hashes the caller cannot steer byte by byte.
      const key = hashOf(sessionId);
      const session = sessions.get(key);
      if (!session) {
        return false;
      }

      const at = now();
      if (session.idleUntil <= at || session.hardUntil <= at) {
        sessions.delete(key);

        return false;
      }

      session.idleUntil = Math.min(at + SESSION_IDLE_SECONDS * 1000, session.hardUntil);

      return true;
    },
    revoke(sessionId) {
      sessions.delete(hashOf(sessionId));
    },
  };
}
