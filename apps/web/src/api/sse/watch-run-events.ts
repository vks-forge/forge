/**
 * `watchRunEvents()`: follows one run's live events over server-sent events.
 *
 * Why: a browser EventSource cannot send an Authorization header, so the page first asks
 *   `POST /auth/sse-ticket` for a 60-second ticket bound to the run and puts only that ticket
 *   in the stream URL; the install token never appears in a URL or the history. A ticket is
 *   only checked when the connection is made, so when the browser gives up on a dropped
 *   stream the helper asks for a fresh ticket and resumes after the last `seq` it saw
 *   (`?after=`), losing and repeating nothing. Frames are validated with core's `RunEvent`
 *   schema; a bad frame is reported, never rendered. Wired into the ticket thread in W3.
 *
 * Exports: watchRunEvents().
 * Depends on: @forge/core (RunEvent), api/api-error, api/http/request-json, schemas/http,
 *   types/sse.types.
 */

import { RunEvent } from '@forge/core';
import { ApiError } from '#/api/api-error.js';
import { requestJson } from '#/api/http/request-json.js';
import { SseTicketReply } from '#/schemas/http.js';
import type {
  EventSourceCtor,
  RunEventWatch,
  RunEventWatchOptions,
} from '#/types/sse.types.js';

/** `EventSource.CLOSED`: the browser stopped retrying (auth failure, 204, network down). */
const CLOSED = 2;
const DEFAULT_RECONNECTS = 5;
const EVENT_TYPES = RunEvent.options.map((option) => option.shape.type.value);

const defaultBackoff = (attempt: number): number =>
  Math.min(500 * 2 ** (attempt - 1), 8000);

export function watchRunEvents(options: RunEventWatchOptions): RunEventWatch {
  const Source: EventSourceCtor =
    options.EventSource ?? (globalThis.EventSource as unknown as EventSourceCtor);

  const limit = options.maxReconnects ?? DEFAULT_RECONNECTS;
  const backoff = options.backoffMs ?? defaultBackoff;
  let closed = false;
  let attempts = 0;
  let lastSeq: number | undefined;
  let source: InstanceType<EventSourceCtor> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stop = (): void => {
    closed = true;
    clearTimeout(timer);
    source?.close();
  };

  const fail = (error: ApiError): void => {
    stop();
    options.onError(error);
  };

  const retry = (cause: unknown): void => {
    attempts += 1;
    if (attempts > limit) {
      fail(new ApiError('network', 'Lost the live connection to Forge.', { cause }));

      return;
    }

    options.onConnection?.('reconnecting');
    timer = setTimeout(() => void connect(), backoff(attempts));
  };

  const onFrame = (frame: MessageEvent<string>): void => {
    let json: unknown;
    try {
      json = JSON.parse(frame.data);
    } catch {
      json = undefined;
    }

    const parsed = RunEvent.safeParse(json);
    if (!parsed.success) {
      options.onError(
        new ApiError('payload', 'Forge sent a run event this UI cannot read.', {
          cause: parsed.error,
        }),
      );

      return;
    }

    lastSeq = parsed.data.seq;
    options.onEvent(parsed.data);
  };

  const onEnd = (frame: MessageEvent<string>): void => {
    let status = 'unknown';
    try {
      const body = JSON.parse(frame.data) as { status?: unknown };
      status = typeof body.status === 'string' ? body.status : status;
    } catch {
      // An unreadable end frame still means the stream is over.
    }

    stop();
    options.onEnd(status);
  };

  async function connect(): Promise<void> {
    options.onConnection?.('connecting');
    try {
      const { ticket } = await requestJson(
        { baseUrl: options.baseUrl, ...(options.fetch ? { fetch: options.fetch } : {}) },
        '/auth/sse-ticket',
        SseTicketReply,
        { method: 'POST', body: { run_id: options.runId } },
      );

      if (closed) {
        return;
      }

      const after = lastSeq === undefined ? '' : `&after=${lastSeq}`;
      const url = `${options.baseUrl}/runs/${encodeURIComponent(options.runId)}/events?ticket=${encodeURIComponent(ticket)}${after}`;
      const next = new Source(url);
      source = next;
      for (const type of EVENT_TYPES) {
        next.addEventListener(type, onFrame);
      }

      next.addEventListener('end', onEnd);
      next.onopen = () => {
        attempts = 0;
        options.onConnection?.('open');
      };

      next.onerror = (event) => {
        if (next.readyState === CLOSED && !closed) {
          next.close();
          retry(event);
        }
      };
    } catch (error) {
      if (closed) {
        return;
      }

      // A refusal (unknown run, bad credentials) will not improve by asking again.
      if (error instanceof ApiError && error.kind !== 'network') {
        fail(error);
      } else {
        retry(error);
      }
    }
  }

  void connect();

  return { close: stop };
}
