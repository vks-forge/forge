/**
 * Writing JSON responses.
 *
 * Why: every response must carry the same safe headers and a body that was serialised
 *   before anything was written, so a handler that fails halfway never leaves a truncated
 *   JSON document. `Cache-Control: no-store` keeps ticket data out of caches, and no CORS
 *   header is ever set: the control room and CLI are same-origin or non-browser clients
 *   and a browser page on another origin must not be able to call the API (d-0061).
 *
 * Exports: sendJson(), sendError().
 * Depends on: node:http, services/http/http-errors. IO: writes the response.
 */

import type { ServerResponse } from 'node:http';
import { errorBody, statusOf } from '#/services/http/http-errors.js';

/** Sends `body` as JSON with `status`; does nothing if the response was already sent. */
export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent || res.writableEnded) {
    return;
  }

  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });

  res.end(text);
}

/** Maps `error` to its status and safe body and sends it. */
export function sendError(res: ServerResponse, error: unknown): void {
  sendJson(res, statusOf(error), errorBody(error));
}
