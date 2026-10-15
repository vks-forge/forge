/**
 * Pins: the SSE helper fetches a ticket first and puts only the ticket in the stream URL,
 * delivers validated RunEvents, resumes after the last seq with a fresh ticket when the browser
 * gives up, stops on the server's `end` event, and reports refusals and bad frames.
 *
 * Why: browsers cannot send an Authorization header on an EventSource, so a ticket is the only
 *   way in, and tickets expire in 60 s. If the helper leaked the install token into a URL,
 *   reconnected with a stale ticket, or replayed events after a drop, the live ticket thread
 *   (W3) would be insecure, dead after a minute, or show duplicates.
 * Depends on: src/api/sse/watch-run-events. Fake fetch, fake EventSource, fake timers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchRunEvents } from '#/api/sse/watch-run-events.js';
import type { EventSourceLike } from '#/types/sse.types.js';

class FakeSource implements EventSourceLike {
  static all: FakeSource[] = [];
  readyState = 1;
  onopen: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  closed = false;
  private listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();

  constructor(readonly url: string) {
    FakeSource.all.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close(): void {
    this.closed = true;
    this.readyState = 2;
  }

  emit(type: string, data: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data: JSON.stringify(data) } as MessageEvent<string>);
    }
  }

  /** The browser gave up (ticket refused, 204, network down). */
  drop(): void {
    this.readyState = 2;
    this.onerror?.({});
  }
}

const text = (seq: number) => ({
  type: 'text',
  seq,
  ts: '2026-10-15T10:00:00.000Z',
  text: `hello ${seq}`,
});

const ticketFetch = () =>
  vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(
        Response.json({ ticket: `t${FakeSource.all.length + 1}`, expires_in_s: 60 }),
      ),
    );

const flush = () => vi.advanceTimersByTimeAsync(0);

function start(overrides: Partial<Parameters<typeof watchRunEvents>[0]> = {}) {
  const fetch = ticketFetch();
  const events: unknown[] = [];
  const errors: { kind: string; message: string }[] = [];
  const ends: string[] = [];
  const watch = watchRunEvents({
    runId: 'run-1',
    baseUrl: '/api',
    fetch,
    EventSource: FakeSource,
    backoffMs: () => 10,
    onEvent: (e) => events.push(e),
    onEnd: (s) => ends.push(s),
    onError: (e) => errors.push(e),
    ...overrides,
  });

  return { fetch, events, errors, ends, watch };
}

beforeEach(() => {
  FakeSource.all = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('watchRunEvents', () => {
  it('asks for a ticket for this run, then streams with only the ticket in the URL', async () => {
    const { fetch } = start();
    await flush();

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/sse-ticket');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ run_id: 'run-1' });
    expect(FakeSource.all[0]?.url).toBe('/api/runs/run-1/events?ticket=t1');
    expect(FakeSource.all[0]?.url).not.toMatch(/token|bearer/i);
  });

  it('delivers validated run events', async () => {
    const { events } = start();
    await flush();

    FakeSource.all[0]?.emit('text', text(1));

    expect(events).toEqual([text(1)]);
  });

  it('reports a frame that is not a run event and keeps going', async () => {
    const { events, errors } = start();
    await flush();

    FakeSource.all[0]?.emit('text', { type: 'text', seq: 'one' });
    FakeSource.all[0]?.emit('text', text(2));

    expect(errors[0]?.kind).toBe('payload');
    expect(events).toEqual([text(2)]);
  });

  it('reconnects with a fresh ticket after the last seq it saw', async () => {
    const { events } = start();
    await flush();
    FakeSource.all[0]?.emit('text', text(7));

    FakeSource.all[0]?.drop();
    await vi.advanceTimersByTimeAsync(10);

    expect(FakeSource.all).toHaveLength(2);
    expect(FakeSource.all[1]?.url).toBe('/api/runs/run-1/events?ticket=t2&after=7');
    FakeSource.all[1]?.emit('text', text(8));
    expect(events).toHaveLength(2);
  });

  it('stops on the server end event and reports the final status', async () => {
    const { ends, errors } = start();
    await flush();

    FakeSource.all[0]?.emit('end', { status: 'settled' });

    expect(ends).toEqual(['settled']);
    expect(FakeSource.all[0]?.closed).toBe(true);
    FakeSource.all[0]?.drop();
    await vi.advanceTimersByTimeAsync(50);
    expect(FakeSource.all).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  it('gives up with a network error after too many reconnects', async () => {
    const { errors } = start({ maxReconnects: 2 });
    await flush();

    for (let i = 0; i < 3; i += 1) {
      FakeSource.all.at(-1)?.drop();
      await vi.advanceTimersByTimeAsync(10);
    }

    expect(errors).toHaveLength(1);
    expect(errors[0]?.kind).toBe('network');
  });

  it('does not retry when the server refuses the ticket request', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: { code: 'run_not_found', message: 'no run' } },
          { status: 404 },
        ),
      );

    const { errors } = start({ fetch });
    await flush();
    await vi.advanceTimersByTimeAsync(100);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ kind: 'http', message: 'no run' });
    expect(FakeSource.all).toHaveLength(0);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries a ticket request that failed to connect', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValue(Response.json({ ticket: 'late', expires_in_s: 60 }));

    start({ fetch });

    await flush();
    await vi.advanceTimersByTimeAsync(10);

    expect(FakeSource.all[0]?.url).toContain('ticket=late');
  });

  it('close() stops the stream and any pending reconnect', async () => {
    const { watch } = start();
    await flush();
    FakeSource.all[0]?.drop();

    watch.close();
    watch.close();
    await vi.advanceTimersByTimeAsync(100);

    expect(FakeSource.all).toHaveLength(1);
    expect(FakeSource.all[0]?.closed).toBe(true);
  });

  it('does not open a stream when closed while the ticket is in flight', async () => {
    const { watch } = start();

    watch.close();
    await flush();

    expect(FakeSource.all).toHaveLength(0);
  });
});
