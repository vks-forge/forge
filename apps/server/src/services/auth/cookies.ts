/**
 * The browser session cookie: its name, its attributes and how to read it back.
 *
 * Why: the control room must be signed in without any script on the page ever holding a
 *   credential. A cookie that is `HttpOnly` (page JavaScript cannot read it, so an injected
 *   script or an extension cannot copy it), `SameSite=Strict` (a page on another site never
 *   makes the browser attach it) and `Path=/` is the only carrier that fits. `Secure` is left
 *   off on purpose: the server speaks plain http on loopback, and browsers that honour
 *   `Secure` on `127.0.0.1` do not all do so on `localhost`. Both set and clear live here so
 *   the attributes cannot drift apart: a clear that differs in `Path` would leave the cookie
 *   behind.
 *
 * Exports: SESSION_COOKIE, sessionCookie(), clearedSessionCookie(), sessionIdOf().
 * Depends on: none. No IO.
 */

export const SESSION_COOKIE = 'forge_session';

const ATTRIBUTES = 'HttpOnly; SameSite=Strict; Path=/';

/** The `Set-Cookie` value that starts a session. `value` is base64url, so it needs no quoting. */
export function sessionCookie(value: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${value}; ${ATTRIBUTES}; Max-Age=${maxAgeSeconds}`;
}

/** The `Set-Cookie` value that removes the cookie from the browser. */
export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; ${ATTRIBUTES}; Max-Age=0`;
}

/** The session id in a `Cookie` header, or undefined. Other cookies are ignored. */
export function sessionIdOf(header: string | undefined): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === SESSION_COOKIE) {
      const value = part.slice(at + 1).trim();

      return value === '' ? undefined : value;
    }
  }

  return undefined;
}
