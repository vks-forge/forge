/**
 * `watchProjectEvents()`: follows one project's change feed and says which queries are stale.
 *
 * Why: the Board, the Card page and the Inbox badge must show what the Director and Workers
 *   just did without the user reloading, and polling every screen every few seconds is slow
 *   to notice and wasteful. The server sends no data here, only "these query keys changed", so
 *   the watcher stays tiny and every screen keeps its own fetch and its own error handling. A
 *   browser EventSource cannot send an Authorization header, so the watcher first asks
 *   `POST /auth/sse-ticket` for a short-lived ticket bound to the project and puts only that in
 *   the URL. A ticket is checked only when the connection is made, so when the stream drops
 *   the watcher asks for a fresh one, retries with a growing delay and never gives up on a
 *   network failure (a laptop that slept must come back by itself). Nothing is replayed, so
 *   once the stream is back `onResync` tells the caller to refetch everything. A refusal that
 *   asking again cannot fix stops the watch and says so; screens fall back to polling.
 *
 * Exports: watchProjectEvents().
 * Depends on: api/api-error, api/http/request-json, schemas/http, types/sse.types, zod.
 */

import { z } from 'zod';
import { ApiError } from '#/api/api-error.js';
import { requestJson } from '#/api/http/request-json.js';
import { SseTicketReply } from '#/schemas/http.js';
import type {
  EventSourceCtor,
  EventSourceLike,
  ProjectEventsWatch,
  ProjectEventsWatchOptions,
} from '#/types/sse.types.js';

/** `EventSource.CLOSED`: the browser stopped retrying (auth failure, 204, network down). */
const CLOSED = 2;

const Invalidation = z.object({
  keys: z.array(z.array(z.union([z.string(), z.number()]))),
});

const defaultBackoff = (attempt: number): number =>
  Math.min(1000 * 2 ** (attempt - 1), 30_000);

export function watchProjectEvents(
  options: ProjectEventsWatchOptions,
): ProjectEventsWatch {
  const Source: EventSourceCtor =
    options.EventSource ?? (globalThis.EventSource as unknown as EventSourceCtor);

  const backoff = options.backoffMs ?? defaultBackoff;
  let closed = false;
  let attempts = 0;
  // Set once the stream has been lost; the next open must resync.
  let dropped = false;
  let source: EventSourceLike | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stop = (): void => {
    closed = true;
    clearTimeout(timer);
    source?.close();
  };

  const retry = (): void => {
    attempts += 1;
    dropped = true;
    options.onConnection?.('reconnecting');
    timer = setTimeout(() => void connect(), backoff(attempts));
  };

  const onInvalidate = (frame: MessageEvent<string>): void => {
    let json: unknown;
    try {
      json = JSON.parse(frame.data);
    } catch {
      json = undefined;
    }

    const parsed = Invalidation.safeParse(json);
    if (!parsed.success) {
      // Not fatal: the next frame may be fine, and polling covers the gap.
      options.onError(
        new ApiError('payload', 'Forge sent a change notice this UI cannot read.', {
          cause: parsed.error,
        }),
      );

      return;
    }

    options.onInvalidate(parsed.data.keys);
  };

  async function connect(): Promise<void> {
    options.onConnection?.('connecting');
    try {
      const { ticket } = await requestJson(
        { baseUrl: options.baseUrl, ...(options.fetch ? { fetch: options.fetch } : {}) },
        '/auth/sse-ticket',
        SseTicketReply,
        { method: 'POST', body: { project: options.slug } },
      );

      if (closed) {
        return;
      }

      const url = `${options.baseUrl}/projects/${encodeURIComponent(options.slug)}/events?ticket=${encodeURIComponent(ticket)}`;
      const next = new Source(url);
      source = next;
      next.addEventListener('invalidate', onInvalidate);
      next.onopen = () => {
        attempts = 0;
        options.onConnection?.('open');
        if (dropped) {
          dropped = false;
          options.onResync();
        }
      };

      next.onerror = () => {
        if (closed) {
          return;
        }

        if (next.readyState === CLOSED) {
          next.close();
          retry();

          return;
        }

        // The browser is retrying on its own; until it reopens, polling must not stand down.
        dropped = true;
        options.onConnection?.('reconnecting');
      };
    } catch (error) {
      if (closed) {
        return;
      }

      // A refusal (unknown project, bad credentials) will not improve by asking again.
      if (error instanceof ApiError && error.kind !== 'network') {
        stop();
        options.onError(error);
      } else {
        retry();
      }
    }
  }

  void connect();

  return { close: stop };
}
