/**
 * Shapes for watching a run's event stream.
 *
 * Why: the live ticket thread (W3) and later screens all follow a Worker the same way, and the
 *   project scope follows the project's change feed; one options bag style with injectable
 *   `fetch` and `EventSource` lets each helper be tested without a browser or a server.
 *
 * Exports: ConnectionState, RunEventWatchOptions, RunEventWatch, ProjectEventsWatchOptions,
 *   ProjectEventsWatch, EventSourceLike, EventSourceCtor.
 * Depends on: @forge/core (RunEvent type), api/api-error (type).
 */

import type { RunEvent } from '@forge/core';
import type { ApiError } from '#/api/api-error.js';

/** The slice of the browser's EventSource the helper uses. */
export interface EventSourceLike {
  readonly readyState: number;
  onopen: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
  close(): void;
}

export type EventSourceCtor = new (url: string) => EventSourceLike;

/** `connecting`: asking for a ticket or opening the stream; `open`: streaming; `reconnecting`: the stream dropped and a retry is scheduled. */
export type ConnectionState = 'connecting' | 'open' | 'reconnecting';

export interface RunEventWatchOptions {
  readonly runId: string;
  /** Path prefix of the proxy or server, such as `/api`. */
  readonly baseUrl: string;
  readonly onEvent: (event: RunEvent) => void;
  /** The server's closing `end` event: the run is over and everything was sent. */
  readonly onEnd: (status: string) => void;
  readonly onError: (error: ApiError) => void;
  /** Tells the page whether it is live, so a quiet run is not mistaken for a dead connection. */
  readonly onConnection?: (state: ConnectionState) => void;
  readonly fetch?: typeof globalThis.fetch;
  readonly EventSource?: EventSourceCtor;
  /** Reconnects before giving up; default 5. */
  readonly maxReconnects?: number;
  /** Delay before reconnect number `attempt` (1-based), in ms. */
  readonly backoffMs?: (attempt: number) => number;
}

export interface RunEventWatch {
  /** Stops watching; safe to call twice. */
  close(): void;
}

export interface ProjectEventsWatchOptions {
  readonly slug: string;
  /** Path prefix of the proxy or server, such as `/api`. */
  readonly baseUrl: string;
  /** Query keys the server says are stale, each exactly as the screens use it. */
  readonly onInvalidate: (keys: readonly (readonly (string | number)[])[]) => void;
  /** The stream was lost and is back: whatever happened in between was never sent. */
  readonly onResync: () => void;
  /** A refusal that asking again will not fix (unknown project, bad credentials): the watch stops. */
  readonly onError: (error: ApiError) => void;
  readonly onConnection?: (state: ConnectionState) => void;
  readonly fetch?: typeof globalThis.fetch;
  readonly EventSource?: EventSourceCtor;
  /** Delay before reconnect number `attempt` (1-based), in ms. */
  readonly backoffMs?: (attempt: number) => number;
}

export interface ProjectEventsWatch {
  /** Stops watching; safe to call twice. */
  close(): void;
}
