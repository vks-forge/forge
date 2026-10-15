/**
 * `GET /runs/:id/events`: a run's events as server-sent events, resumable.
 *
 * Why: the control room shows a Worker's progress live and must survive a dropped
 *   connection without losing or repeating events. The client's `Last-Event-ID` (or
 *   `?after=`) is the `seq` it last saw; the stream replays what is stored after it, then
 *   follows. The stream ends when the client leaves, the server shuts down, or the run is
 *   over and fully sent (services/http/sse.ts). A client that reconnects after that gets
 *   204, which makes EventSource stop instead of reconnecting for ever. Browsers cannot set
 *   headers on an EventSource, so besides the install token the route accepts `?ticket=`, a
 *   short-lived ticket for this run (`POST /auth/sse-ticket`).
 *
 * Exports: runEventsRoute().
 * Depends on: services/http/http-errors, services/http/response-sink, services/http/sse, types/routes.
 *   IO: reads storage, writes the response stream.
 */

import { HttpError } from '#/services/http/http-errors.js';
import { responseSink } from '#/services/http/response-sink.js';
import { hasNothingMore, parseCursor, streamRunEvents } from '#/services/http/sse.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

export function runEventsRoute(deps: RouteDeps): Route {
  return {
    method: 'GET',
    path: '/runs/:id/events',
    access: 'token_or_ticket',
    async handle({ req, res, params, url }) {
      const runId = params['id'] ?? '';
      const header = req.headers['last-event-id'];
      const after = parseCursor(
        Array.isArray(header) ? header[0] : header,
        url.searchParams.get('after'),
      );

      const run = await deps.storage.transaction((tx) => tx.runs.get(runId));
      if (!run) {
        throw new HttpError(404, 'run_not_found', `no run ${runId}`);
      }

      // 204 tells EventSource to stop reconnecting: the run is over and this client has
      // everything. A 200 with an `end` event would be followed by a reconnect, forever.
      if (await hasNothingMore(deps.storage, runId, after)) {
        res.writeHead(204, { 'cache-control': 'no-store' }).end();

        return;
      }

      const gone = new AbortController();
      const stop = (): void => gone.abort();
      res.once('close', stop);
      deps.shutdown.addEventListener('abort', stop, { once: true });

      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
        'x-content-type-options': 'nosniff',
      });

      res.write('retry: 2000\n\n');
      try {
        await streamRunEvents({
          storage: deps.storage,
          runId,
          after,
          sink: responseSink(res),
          signal: gone.signal,
          pollMs: deps.http.ssePollMs,
          heartbeatMs: deps.http.sseHeartbeatMs,
        });
      } finally {
        deps.shutdown.removeEventListener('abort', stop);
        res.end();
      }
    },
  };
}
