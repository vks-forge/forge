/**
 * Shapes of the debug trace log's file side: writer, redactor, card lookup, assembled trace.
 *
 * Why: the trace (d-0163) is a small pipeline (sink, card lookup, redaction, file writer) whose
 *   parts are built separately and tested with fakes (a fake clock, a temp folder, a recording
 *   writer). Naming the seams here keeps each part replaceable and keeps the engine and the
 *   adapters on the one-method `TraceSink` port from `@forge/core`.
 *
 * Exports: TraceWriterOptions, TraceWriter, TraceLookup, Redactor, TraceSinkOptions, Trace.
 * Depends on: @forge/core (Clock, TraceEntry, TraceSink). Types only.
 */

import type { Clock, TraceEntry, TraceSink } from '@forge/core';

export interface TraceWriterOptions {
  /** Folder of the day files; card files go in `<dir>/cards`. */
  readonly dir: string;
  /** Files whose modification time is older than this many days are deleted. */
  readonly keepDays: number;
  /** Time and timers; a fake in tests. */
  readonly clock: Clock;
  /** Where the one-time write-failure warning goes. */
  readonly stderr: (text: string) => void;
  /** Buffer flush period; default 200 ms. */
  readonly flushMs?: number;
  /** Largest single entry in bytes before its biggest strings are cut; default 2 MiB. */
  readonly maxEntryBytes?: number;
}

export interface TraceWriter {
  /** Queues one entry for the day file and, when `cardId` is set, that card's file. Never throws. */
  write(entry: TraceEntry, cardId?: string): void;
  /** Starts the daily retention pass (and runs one now). */
  start(): void;
  /** Writes everything queued so far. Never rejects. */
  flush(): Promise<void>;
  /** Deletes expired files; resolves with how many went. */
  prune(): Promise<number>;
  /** Stops timers and flushes. */
  close(): Promise<void>;
}

/** Finds which card an id belongs to; both answer `undefined` when unknown and may throw. */
export interface TraceLookup {
  cardOfTicket(ticketId: string): Promise<string | undefined>;
  ticketOfRun(runId: string): Promise<string | undefined>;
}

export interface Redactor {
  /** A plain-JSON copy of `entry` with every secret removed; may throw, and then the entry must not be written. */
  redact(entry: TraceEntry, secrets: readonly string[]): TraceEntry;
}

export interface TraceSinkOptions {
  readonly write: (entry: TraceEntry, cardId?: string) => void;
  readonly redactor: Redactor;
  /** Literal secret values to remove (install token, SecretStore, passthrough env). */
  readonly secretValues: () => Promise<readonly string[]>;
  readonly now: () => number;
  readonly lookup: TraceLookup;
  readonly stderr: (text: string) => void;
}

/** What composition holds: the sink to pass around and the way to stop it. */
export interface Trace {
  readonly sink: TraceSink;
  readonly enabled: boolean;
  /** Flushes and stops timers; safe to call twice. */
  close(): Promise<void>;
}
