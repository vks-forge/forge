/**
 * The run-event stream: frame format, cursor parsing, replay then follow, end, heartbeat.
 *
 * Why: a control room that reconnects must neither lose nor repeat events, so the contract
 *   is exact: each frame's `id` is the event's `seq`, the cursor means "only later events",
 *   a stream follows new events as they are appended (including by another process), a
 *   finished run closes with an `end` frame, and an idle open stream sends comments so a
 *   dead client is noticed. These run against real storage with no socket.
 *
 * Pins: frame text, cursor precedence and validation, replay-after-cursor, live follow,
 *   end on a finished run, heartbeat, abort.
 * Depends on: src/services/http/sse, @forge/db (memory storage). No IO.
 */

import { createMemoryStorage } from '@forge/db';
import type { NewRunEvent, Run, StorageAdapter } from '@forge/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { HttpError } from '#/services/http/http-errors.js';
import {
  formatSseComment,
  formatSseEvent,
  parseCursor,
  streamRunEvents,
} from '#/services/http/sse.js';

const RUN: Run = {
  id: 'run-1',
  ticket_id: 'FX-1',
  harness: 'claude-code',
  driver_version: 'v',
  cwd: '/w',
  lane: 'express',
  started_at: '2026-10-13T00:00:00.000Z',
  status: 'running',
  owner: 'srv-1',
};

const text = (n: number): NewRunEvent => ({
  type: 'text',
  ts: '2026-10-13T00:00:00.000Z',
  text: `event ${n}`,
});

let storage: StorageAdapter;

async function append(count: number): Promise<void> {
  await storage.transaction(async (tx) => {
    for (let i = 0; i < count; i++) {
      await tx.runEvents.append('run-1', text(i));
    }
  });
}

/** Collects frames; `onWrite` lets a test act once the stream has sent something. */
function sinkOf(onWrite?: (chunks: string[]) => void) {
  const chunks: string[] = [];

  return {
    chunks,
    sink: {
      write: async (chunk: string) => {
        chunks.push(chunk);
        onWrite?.(chunks);
      },
    },
  };
}

const ids = (chunks: string[]): number[] =>
  chunks.flatMap((c) =>
    c.startsWith('id: ') ? [Number(c.split('\n')[0]?.slice(4))] : [],
  );

beforeEach(async () => {
  storage = createMemoryStorage();
  await storage.transaction((tx) => tx.runs.insert(RUN));
});

describe('frames', () => {
  it('formats an event with its seq as the id', async () => {
    await append(1);
    const [event] = await storage.transaction((tx) => tx.runEvents.listByRun('run-1'));
    const frame = formatSseEvent(event as NonNullable<typeof event>);

    expect(frame.startsWith('id: 0\nevent: text\ndata: {')).toBe(true);
    expect(frame.endsWith('\n\n')).toBe(true);
    expect(frame.split('\n').filter((l) => l.startsWith('data: '))).toHaveLength(1);
  });

  it('keeps a comment on one line', () => {
    expect(formatSseComment('a\nb')).toBe(': a b\n\n');
  });
});

describe('parseCursor', () => {
  it('prefers the header over the query', () => {
    expect(parseCursor('7', '3')).toBe(7);
    expect(parseCursor(undefined, '3')).toBe(3);
    expect(parseCursor('', '3')).toBe(3);
  });

  it('returns undefined when no cursor is sent', () => {
    expect(parseCursor(undefined, null)).toBeUndefined();
  });

  it.each(['abc', '-1', '1.5'])('rejects %s with a 400', (bad) => {
    expect(() => parseCursor(bad, null)).toThrow(HttpError);
  });
});

describe('streamRunEvents', () => {
  it('replays only events after the cursor, then ends on a finished run', async () => {
    await append(5);
    await storage.transaction((tx) =>
      tx.runs.update('run-1', {
        status: 'success',
        ended_at: '2026-10-13T00:01:00.000Z',
      }),
    );

    const { chunks, sink } = sinkOf();
    await streamRunEvents({
      storage,
      runId: 'run-1',
      after: 2,
      sink,
      signal: new AbortController().signal,
      pollMs: 5,
      heartbeatMs: 10_000,
    });

    expect(ids(chunks)).toEqual([3, 4]);
    expect(chunks.at(-1)).toBe('event: end\ndata: {"status":"success"}\n\n');
  });

  it('follows events appended after it started, including from another writer', async () => {
    await append(1);
    const stop = new AbortController();
    const { chunks, sink } = sinkOf((seen) => {
      if (ids(seen).length === 3) {
        stop.abort();
      }
    });

    const streaming = streamRunEvents({
      storage,
      runId: 'run-1',
      after: undefined,
      sink,
      signal: stop.signal,
      pollMs: 5,
      heartbeatMs: 10_000,
    });

    await append(2);
    await streaming;

    expect(ids(chunks)).toEqual([0, 1, 2]);
  });

  it('sends a heartbeat comment while idle and stops when aborted', async () => {
    const stop = new AbortController();
    const { chunks, sink } = sinkOf((seen) => {
      if (seen.some((c) => c.startsWith(': heartbeat'))) {
        stop.abort();
      }
    });

    await streamRunEvents({
      storage,
      runId: 'run-1',
      after: undefined,
      sink,
      signal: stop.signal,
      pollMs: 5,
      heartbeatMs: 20,
    });

    expect(chunks).toEqual([': heartbeat\n\n']);
  });

  it('returns at once when the signal is already aborted', async () => {
    const stop = new AbortController();
    stop.abort();
    const { chunks, sink } = sinkOf();

    await streamRunEvents({
      storage,
      runId: 'run-1',
      after: undefined,
      sink,
      signal: stop.signal,
      pollMs: 5,
      heartbeatMs: 10,
    });

    expect(chunks).toEqual([]);
  });
});
