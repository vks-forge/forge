/**
 * `GET /projects/:slug/events`: the project's live stream, invalidate-only (d-0132, d-0141 item 5).
 *
 * Why: the Board, the Card page, the ticket list and the Inbox must update within a second of
 *   any write, without polling. This stream says only which queries are stale: each frame is
 *   `event: invalidate` with `data: {"keys":[["cards","<slug>"],["card","DCP-C1"],...]}` and
 *   the client refetches those. Nothing is replayed and nothing is stored: a reconnecting
 *   client refetches everything, so a dropped frame costs one refetch and the server holds no
 *   per-client state. A heartbeat comment every 25 seconds keeps idle connections open and
 *   shows a gone client quickly. Browsers cannot set headers on an `EventSource`, so besides
 *   the install token the route accepts `?ticket=`, a ticket for this project only (`POST
 *   /auth/sse-ticket` with `{project}`); a run ticket does not open it. An unknown project is
 *   404 before the stream starts.
 *
 * Exports: projectEventsRoute(), PROJECT_HEARTBEAT_MS.
 * Depends on: services/find-project, services/http/sse, types/routes.
 *   IO: writes the response stream.
 */

import { findProject } from '#/services/find-project.js';
import { formatSseComment } from '#/services/http/sse.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

/** Interval of the heartbeat comment; tests shorten it through `http.projectHeartbeatMs`. */
export const PROJECT_HEARTBEAT_MS = 25_000;

export function projectEventsRoute(deps: RouteDeps): Route {
  return {
    method: 'GET',
    path: '/projects/:slug/events',
    access: 'token_or_ticket',
    async handle({ req, res, params }) {
      const slug = params['slug'] ?? '';
      await deps.storage.transaction((tx) => findProject(tx, slug));

      const gone = new AbortController();
      const stop = (): void => gone.abort();
      res.once('close', stop);
      req.once('close', stop);
      deps.shutdown.addEventListener('abort', stop, { once: true });

      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
        'x-content-type-options': 'nosniff',
      });

      res.write('retry: 2000\n\n');

      const write = (chunk: string): void => {
        if (!res.destroyed && !res.writableEnded) {
          res.write(chunk);
        }
      };

      const unsubscribe = deps.projectEvents.subscribe(slug, (keys) => {
        write(`event: invalidate\ndata: ${JSON.stringify({ keys })}\n\n`);
      });

      const beat = setInterval(
        () => write(formatSseComment('heartbeat')),
        deps.http.projectHeartbeatMs ?? PROJECT_HEARTBEAT_MS,
      );

      try {
        await new Promise<void>((resolve) => {
          if (gone.signal.aborted) {
            resolve();

            return;
          }

          gone.signal.addEventListener('abort', () => resolve(), { once: true });
        });
      } finally {
        clearInterval(beat);
        unsubscribe();
        deps.shutdown.removeEventListener('abort', stop);
        res.end();
      }
    },
  };
}
