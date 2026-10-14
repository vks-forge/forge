/**
 * Server-sent events for a run: replay from a cursor, then follow, until the run ends.
 *
 * Why: the control room and the CLI watch a Worker live, and must be able to reconnect
 *   without losing or repeating events. Every run event already has a gap-free `seq`
 *   allocated by storage, so the stream sends `id: <seq>`; a reconnecting client's
 *   `Last-Event-ID` is exactly the cursor to resume from. Events are read from storage,
 *   not from an in-process emitter, because the per-run MCP server is a separate process
 *   that also appends events (`finish`, `ask`) and an emitter would never see them. A run
 *   that has ended and has nothing left to send closes the stream with an `end` event, so
 *   a finished run does not leave a client reconnecting forever. Heartbeat comments keep
 *   idle connections from being dropped by proxies and tell us quickly when a client left.
 *
 * Exports: formatSseEvent(), formatSseComment(), parseCursor(), hasNothingMore(), streamRunEvents().
 * Depends on: @forge/core (RunEvent), schemas/api, services/http/http-errors, types/sse.
 *   IO: reads storage, writes to the sink.
 */

import type { RunEvent, StorageAdapter } from '@forge/core';
import { LastEventId } from '#/schemas/api.js';
import { HttpError } from '#/services/http/http-errors.js';
import type { StreamOptions } from '#/types/sse.types.js';

/** One SSE frame for a run event: `id` is the `seq`, `event` the event type. */
export function formatSseEvent(event: RunEvent): string {
  return `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/** A comment frame; clients ignore it, intermediaries see traffic. */
export function formatSseComment(text: string): string {
  return `: ${text.replaceAll(/[\r\n]+/g, ' ')}\n\n`;
}

/** The cursor from the `Last-Event-ID` header, else `?after=`; undefined when neither is sent. Throws 400 when malformed. */
export function parseCursor(
  header: string | undefined,
  query: string | null,
): number | undefined {
  const raw = header !== undefined && header !== '' ? header : query;
  if (raw === null || raw === undefined || raw === '') {
    return undefined;
  }

  const parsed = LastEventId.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(
      400,
      'invalid_cursor',
      'Last-Event-ID or after must be a non-negative integer',
    );
  }

  return parsed.data;
}

/** True when the run has ended and no event is stored after `after`: there is nothing left to send, now or ever. */
export async function hasNothingMore(
  storage: StorageAdapter,
  runId: string,
  after: number | undefined,
): Promise<boolean> {
  return storage.transaction(async (tx) => {
    // Run row first, like the stream loop: an ended run's events are then complete.
    const run = await tx.runs.get(runId);
    if (run?.ended_at === undefined) {
      return false;
    }

    return (await tx.runEvents.listByRun(runId, after ?? -1)).length === 0;
  });
}

function defaultWait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };

    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}

/**
 * Sends every stored event after the cursor, then new ones as they appear. Returns when
 * the client is gone (`signal` aborted) or the run has ended and everything was sent.
 */
export async function streamRunEvents(opts: StreamOptions): Promise<void> {
  const wait = opts.wait ?? defaultWait;
  const now = opts.now ?? Date.now;
  let cursor = opts.after ?? -1;
  let lastWrite = now();

  while (!opts.signal.aborted) {
    // Run row first: if it was already ended, the events read next are the complete tail.
    const { ended, status, events } = await opts.storage.transaction(async (tx) => {
      const run = await tx.runs.get(opts.runId);

      return {
        ended: run?.ended_at !== undefined,
        status: run?.status ?? 'unknown',
        events: await tx.runEvents.listByRun(opts.runId, cursor),
      };
    });

    for (const event of events) {
      await opts.sink.write(formatSseEvent(event));
      cursor = event.seq;
      lastWrite = now();
    }

    if (events.length > 0) {
      continue;
    }

    if (ended) {
      await opts.sink.write(`event: end\ndata: ${JSON.stringify({ status })}\n\n`);

      return;
    }

    if (now() - lastWrite >= opts.heartbeatMs) {
      await opts.sink.write(formatSseComment('heartbeat'));
      lastWrite = now();
    }

    await wait(opts.pollMs, opts.signal);
  }
}
