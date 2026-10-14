/**
 * Options of the run-event stream.
 *
 * Why: the stream's loop (replay what is stored after a cursor, then follow new events,
 *   keep the connection warm, stop when the run is over) is independent of sockets. Naming
 *   its inputs lets tests drive it with a plain sink, an abort signal and a fast clock.
 *
 * Exports: StreamOptions.
 * Depends on: @forge/core (StorageAdapter), types/http. Types only.
 */

import type { StorageAdapter } from '@forge/core';
import type { SseSink } from '#/types/http.types.js';

export interface StreamOptions {
  readonly storage: StorageAdapter;
  readonly runId: string;
  /** Highest `seq` the client already has; only later events are sent. Undefined replays from the start. */
  readonly after: number | undefined;
  readonly sink: SseSink;
  /** Aborted when the client disconnects or the server shuts down. */
  readonly signal: AbortSignal;
  readonly pollMs: number;
  readonly heartbeatMs: number;
  /** Sleep that returns early when `signal` aborts; defaults to a timer. */
  readonly wait?: (ms: number, signal: AbortSignal) => Promise<void>;
  /** Epoch ms; defaults to `Date.now`. */
  readonly now?: () => number;
}
