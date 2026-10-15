/**
 * Binding and closing the HTTP server: loopback only.
 *
 * Why: the API is protected by the install token (d-0093), but what keeps it off the network
 *   is that it listens on 127.0.0.1 and nowhere else (d-0093). A config or env typo such as
 *   `0.0.0.0` would publish the control plane to the LAN, so any other host is refused with
 *   a typed error before a socket is opened. A port another program already holds is the
 *   most common start failure of a background server, so it gets its own plain message
 *   (no silent hop to another port: the CLI, the browser and hooks all expect one URL). Closing is bounded: open
 *   keep-alive and SSE connections are dropped after a short grace so a shutdown never
 *   hangs on a client that will not leave.
 *
 * Exports: LOOPBACK_HOST, KEEP_ALIVE_TIMEOUT_MS, HEADERS_TIMEOUT_MS, BindRefusedError, PortInUseError,
 *   assertLoopbackBind(), listen(), closeServer().
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

/** The port is held by another program; family `policy_denied`. */
export class PortInUseError extends ForgeError {
  constructor(host: string, port: number) {
    super(
      'policy_denied',
      `port ${port} on ${host} is already in use by another program; stop it or set FORGE_PORT to a free port`,
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
    server.once('error', (error) =>
      reject(
        (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
          ? new PortInUseError(host, port)
          : error,
      ),
    );

    server.listen(port, host, () => {
      server.removeAllListeners('error');
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
