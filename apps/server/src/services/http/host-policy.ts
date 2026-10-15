/**
 * Which `Host` and `Origin` headers name this server.
 *
 * Why: the server listens on loopback only, but a browser page can still aim at it. A page on
 *   a hostile DNS name that was rebound to 127.0.0.1 sends `Host: evil.example`; a page served
 *   from another local port (another dev server, another app) sends the right name with the
 *   wrong port. Both are refused here: only a loopback name on this server's own port is
 *   answered. And because the browser attaches the session cookie by itself, a state-changing
 *   request that rides on it must prove it came from our own page: its `Origin` must be exactly
 *   the origin the request was addressed to (same scheme, name and port, which `SameSite`
 *   cannot promise because it ignores ports).
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
