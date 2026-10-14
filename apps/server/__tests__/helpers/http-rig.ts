/**
 * A real `node:http` server over a given route table, for the HTTP unit tests.
 *
 * Why: the router, body reader and routes only mean something on a real socket: headers,
 *   chunked bodies, `Connection: close` and client aborts are all socket behaviour. This
 *   starts the production router on `127.0.0.1:0` so each test asserts what a client sees.
 *
 * Exports: HttpRig, startHttp().
 * Depends on: node:http, src/services/http/router, src/services/http/listen. IO: a loopback socket.
 */

import { createServer, request } from 'node:http';
import { closeServer, listen } from '#/services/http/listen.js';
import { createRouter } from '#/services/http/router.js';
import type { Route } from '#/types/http.types.js';

export interface HttpRig {
  readonly url: string;
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

export async function startHttp(routes: readonly Route[]): Promise<HttpRig> {
  const router = createRouter(routes);
  const server = createServer((req, res) => {
    void router.dispatch(req, res);
  });

  const port = await listen(server, '127.0.0.1', 0);
  const url = `http://127.0.0.1:${port}`;

  return {
    url,
    async json(method, path, body, headers = {}) {
      const res = await fetch(`${url}${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...headers },
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
