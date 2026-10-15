/**
 * Which `Host` and `Origin` headers name this server.
 *
 * Why: the server listens on loopback only, but a browser page can still aim at it. The Host
 *   check stops DNS rebinding: a page on a hostile name that was rebound to 127.0.0.1 sends
 *   `Host: evil.example`, which is refused; only a loopback name on this server's own port is
 *   answered. It does not stop a page served from another local port (another dev server,
 *   another app): that page addresses us, so its Host is ours. That case is stopped by the
 *   `Origin` check plus the absence of any CORS header (the browser will not let the page read
 *   a reply, and a write that rides the session cookie must carry an `Origin` exactly equal
 *   to the origin the request was addressed to: same scheme, name and port, which `SameSite`
 *   cannot promise because it ignores ports). A process that is not a browser can forge
 *   both headers; they defend against pages, not against local programs.
 *
 * Exports: isLoopbackHost(), createHostPolicy(), sameOrigin().
 * Depends on: types/http. No IO.
 */

import type { HostPolicy } from '#/types/http.types.js';

const LOOPBACK_NAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

function split(header: string): { name: string; port: string } {
  if (header.startsWith('[')) {
    const end = header.indexOf(']') + 1;

    return {
      name: header.slice(0, end),
      port: header.slice(end).replace(/^:/, ''),
    };
  }

  const at = header.indexOf(':');

  return at < 0
    ? { name: header, port: '' }
    : { name: header.slice(0, at), port: header.slice(at + 1) };
}

/** True when a `Host` header names a loopback address (any port). */
export function isLoopbackHost(header: string | undefined): boolean {
  return !!header && LOOPBACK_NAMES.has(split(header).name.toLowerCase());
}

/**
 * A policy that answers loopback names on `port()`. While `port()` is undefined (a rig that
 * has not bound yet) any port passes; the server always passes the port it bound.
 */
export function createHostPolicy(
  port: () => number | undefined = () => undefined,
): HostPolicy {
  return {
    allows(host) {
      if (!host || !isLoopbackHost(host)) {
        return false;
      }

      const own = port();

      return own === undefined || split(host).port === String(own);
    },
  };
}

/** True when `origin` is exactly `http://<host>`, the origin the request was addressed to. */
export function sameOrigin(
  origin: string | undefined,
  host: string | undefined,
): boolean {
  return (
    origin !== undefined &&
    host !== undefined &&
    origin.toLowerCase() === `http://${host.toLowerCase()}`
  );
}
