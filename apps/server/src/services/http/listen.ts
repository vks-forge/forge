/**
 * Binding and closing the HTTP server: loopback only.
 *
 * Why: the API has no authentication in M0 (d-0036, d-0061); what keeps it private is
 *   that it listens on 127.0.0.1 and nowhere else. A config or env typo such as
 *   `0.0.0.0` would publish an unauthenticated control plane to the network, so any other
 *   host is refused with a typed error before a socket is opened. Closing is bounded: open
 *   keep-alive and SSE connections are dropped after a short grace so a shutdown never
 *   hangs on a client that will not leave.
 *
 * Exports: LOOPBACK_HOST, KEEP_ALIVE_TIMEOUT_MS, HEADERS_TIMEOUT_MS, BindRefusedError, assertLoopbackBind(),
 *   listen(), closeServer().
 * Depends on: node:http, node:net, @forge/core (ForgeError). IO: opens and closes a socket.
 */

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ForgeError } from '@forge/core';

export const LOOPBACK_HOST = '127.0.0.1';

/** The configured bind host is not loopback; family `policy_denied`. */
export class BindRefusedError extends ForgeError {
  constructor(host: string) {
    super(
      'policy_denied',
      `refusing to bind ${JSON.stringify(host)}: the server listens on ${LOOPBACK_HOST} only`,
    );
  }
}

/** Throws BindRefusedError unless `host` is exactly 127.0.0.1. */
export function assertLoopbackBind(host: string): void {
  if (host !== LOOPBACK_HOST) {
    throw new BindRefusedError(host);
  }
}

/**
 * Node closes an idle keep-alive socket after 5 s by default, while clients (the hook
 * process's fetch, the CLI, browsers) pool connections for longer. A request sent on a
 * socket the server is closing at that instant dies with a reset that no retry policy of
 * ours can tell from a real failure. A minute-plus keep-alive makes that window rare, and
 * `headersTimeout` must stay above it.
 */
export const KEEP_ALIVE_TIMEOUT_MS = 65_000;
export const HEADERS_TIMEOUT_MS = 66_000;

/** Starts listening and resolves with the bound port (the real one when `port` is 0). */
export async function listen(
  server: Server,
  host: string,
  port: number,
): Promise<number> {
  assertLoopbackBind(host);
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
  server.headersTimeout = HEADERS_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve((server.address() as AddressInfo).port);
    });
  });
}

/** Stops accepting, lets idle connections go, and force-closes the rest after `forceAfterMs`. */
export function closeServer(server: Server, forceAfterMs = 2_000): Promise<void> {
  return new Promise((resolve) => {
    if (!server.listening) {
      resolve();

      return;
    }

    const timer = setTimeout(() => server.closeAllConnections(), forceAfterMs);
    server.close(() => {
      clearTimeout(timer);
      resolve();
    });

    server.closeIdleConnections();
  });
}
