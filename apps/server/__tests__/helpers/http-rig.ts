/**
 * A real `node:http` server over a given route table, for the HTTP unit tests.
 *
 * Why: the router, body reader and routes only mean something on a real socket: headers,
 *   chunked bodies, `Connection: close` and client aborts are all socket behaviour. This
 *   starts the production router on `127.0.0.1:0` so each test asserts what a client sees.
 *   The router is built with the production guard around `TEST_INSTALL_TOKEN`, and every
 *   helper sends that token unless the test passes its own `authorization` header (an empty
 *   string sends none that parses).
 *
 * Exports: HttpRig, startHttp().
 * Depends on: node:http, src/services/auth, src/services/http/router, src/services/http/listen,
 *   helpers/install-token. IO: a loopback socket.
 */

import { createServer, request } from 'node:http';
import { createAuthGuard } from '#/services/auth/guard.js';
import { createSseTicketIssuer } from '#/services/auth/sse-tickets.js';
import { closeServer, listen } from '#/services/http/listen.js';
import { createRouter } from '#/services/http/router.js';
import type { AuthGuard } from '#/types/auth.types.js';
import type { Route } from '#/types/http.types.js';
import { TEST_INSTALL_TOKEN, bearer } from '#tests/helpers/install-token.js';

export interface HttpRig {
  readonly url: string;
  /** Headers that authenticate a request made with plain `fetch`. */
  readonly authHeaders: Record<string, string>;
  /** Sends a JSON request and returns the status, headers and parsed body (null when empty). */
  json(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<{ status: number; headers: Headers; body: unknown }>;
  /**
   * POSTs headers that declare `declaredBytes` of JSON and sends no body, returning the
   * status. A server that rejects on the declared length answers at once; sending the real
   * megabytes instead races the server closing the socket (a client reset), which is not
   * what these tests are about.
   */
  declaredStatus(
    path: string,
    declaredBytes: number,
    headers?: Record<string, string>,
  ): Promise<number>;
  close(): Promise<void>;
}

/** `guard` replaces the default (test token, real clock) for tests that drive ticket expiry. */
export async function startHttp(
  routes: readonly Route[],
  guard: AuthGuard = createAuthGuard(
    TEST_INSTALL_TOKEN,
    createSseTicketIssuer(() => Date.now()),
  ),
): Promise<HttpRig> {
  const router = createRouter(routes, guard);
  const server = createServer((req, res) => {
    void router.dispatch(req, res);
  });

  const port = await listen(server, '127.0.0.1', 0);
  const url = `http://127.0.0.1:${port}`;

  return {
    url,
    authHeaders: bearer(TEST_INSTALL_TOKEN),
    async json(method, path, body, headers = {}) {
      const res = await fetch(`${url}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          ...bearer(TEST_INSTALL_TOKEN),
          ...headers,
        },
        ...(body === undefined
          ? {}
          : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
      });

      const text = await res.text();

      return {
        status: res.status,
        headers: res.headers,
        body: text ? (JSON.parse(text) as unknown) : null,
      };
    },
    declaredStatus(path, declaredBytes, headers = {}) {
      return new Promise<number>((resolve, reject) => {
        const req = request(
          {
            host: '127.0.0.1',
            port,
            method: 'POST',
            path,
            headers: {
              'content-type': 'application/json',
              'content-length': String(declaredBytes),
              ...bearer(TEST_INSTALL_TOKEN),
              ...headers,
            },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
            req.destroy();
          },
        );

        req.on('error', (error) => {
          // After the status is read the destroy above ends the socket; that is expected.
          if ((error as NodeJS.ErrnoException).code !== 'ECONNRESET') {
            reject(error);
          }
        });

        req.flushHeaders();
      });
    },
    close: () => closeServer(server, 200),
  };
}
