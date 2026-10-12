/**
 * Socket transport for `web_fetch`: GET over node:http(s), pinned to a vetted address.
 *
 * Why: validating a host name and then letting the HTTP client resolve it again leaves a
 *   window for DNS rebinding. This transport dials exactly the address the guard
 *   approved (via a fixed `lookup`) while keeping the original Host header and TLS
 *   server name, sends no cookies or credentials, and asks for an uncompressed body so
 *   the byte cap measures real bytes (tool-system.md §9).
 *
 * Exports: nodeTransport().
 * Depends on: node:http, node:https, types/deps.types. IO: opens a socket.
 */

import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import type { HttpRequest, HttpResponse } from '#/types/deps.types.js';

/** Performs one GET with the connection pinned to `req.address`. */
export function nodeTransport(req: HttpRequest): Promise<HttpResponse> {
  const { url, address, family, signal } = req;
  const secure = url.protocol === 'https:';
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  return new Promise((resolve, reject) => {
    const client = secure ? https : http;
    const request = client.request(
      {
        hostname,
        port: url.port || (secure ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          host: url.host,
          'user-agent': 'forge-web-fetch/0',
          accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.1',
          'accept-encoding': 'identity',
        },
        // Node 24 may ask for all addresses (autoSelectFamily); answer in the shape asked.
        lookup: ((_h: string, opts: { all?: boolean }, cb: (...a: unknown[]) => void) =>
          opts.all
            ? cb(null, [{ address, family }])
            : cb(null, address, family)) as never,
        ...(secure && isIP(hostname) === 0 ? { servername: hostname } : {}),
        signal,
      },
      (res) => {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (typeof v === 'string') headers[k] = v;
          else if (Array.isArray(v) && v[0] !== undefined) headers[k] = v[0];
        }
        resolve({ status: res.statusCode ?? 0, headers, body: res });
      },
    );
    request.on('error', reject);
    request.end();
  });
}
