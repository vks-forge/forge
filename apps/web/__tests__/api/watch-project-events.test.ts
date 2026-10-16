/**
 * Pins: the project watcher asks for a ticket bound to the project and puts only the ticket in
 * the stream URL, hands each `invalidate` frame's query keys to the caller, reports an
 * unreadable frame and keeps going, reconnects with a fresh ticket and a growing delay when
 * the browser gives up and asks for a resync once it is back, keeps retrying a network failure
 * but stops on a refusal, and stops for good when closed.
 *
 * Why: the Board and Card page trust this stream to say what changed. A watcher that sends
 *   the install token in a URL leaks it, one that reuses an expired ticket goes quiet after a
 *   minute, one that does not resync after a drop shows stale cards with no hint, and one
 *   that gives up on a sleeping laptop leaves the page frozen until reload.
 * Depends on: src/api/sse/watch-project-events. Fake fetch, fake EventSource, fake timers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchProjectEvents } from '#/api/sse/watch-project-events.js';
import type { EventSourceLike } from '#/types/sse.types.js';

class FakeSource implements EventSourceLike {
  static all: FakeSource[] = [];
  readyState = 0;
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

  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  emitRaw(type: string, data: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data } as MessageEvent<string>);
    }
  }

  emit(type: string, data: unknown): void {
    this.emitRaw(type, JSON.stringify(data));
  }

  /** The browser gave up (ticket refused, 204, network down). */
  drop(): void {
    this.readyState = 2;
    this.onerror?.({});
  }

  /** The browser is retrying on its own. */
  blip(): void {
    this.readyState = 0;
    this.onerror?.({});
  }
}

const KEYS = [
  ['cards', 'demo'],
  ['card', 'DCP-C1'],
  ['tickets', 'demo'],
  ['inbox', 'demo'],
];

const ticketFetch = () =>
  vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(
        Response.json({ ticket: `t${FakeSource.all.length + 1}`, expires_in_s: 60 }),
      ),
    );

const flush = () => vi.advanceTimersByTimeAsync(0);

function start(overrides: Partial<Parameters<typeof watchProjectEvents>[0]> = {}) {
  const fetch = ticketFetch();
  const invalidated: unknown[] = [];
  const errors: { kind: string; status: number | undefined }[] = [];
  const states: string[] = [];
  const resyncs: number[] = [];
  const watch = watchProjectEvents({
    slug: 'demo',
    baseUrl: '/api',
    fetch,
    EventSource: FakeSource,
    backoffMs: () => 10,
    onInvalidate: (keys) => invalidated.push(keys),
    onResync: () => resyncs.push(FakeSource.all.length),
    onError: (e) => errors.push({ kind: e.kind, status: e.status }),
    onConnection: (state) => states.push(state),
    ...overrides,
  });

  return { fetch, invalidated, errors, states, resyncs, watch };
}

beforeEach(() => {
  FakeSource.all = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('watchProjectEvents', () => {
  it('asks for a ticket for this project, then streams with only the ticket in the URL', async () => {
    const { fetch } = start();
    await flush();

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/sse-ticket');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ project: 'demo' });
    expect(FakeSource.all[0]?.url).toBe('/api/projects/demo/events?ticket=t1');
    expect(FakeSource.all[0]?.url).not.toMatch(/token|bearer/i);
  });

  it('hands over the query keys of each invalidate frame', async () => {
    const { invalidated } = start();
    await flush();

    FakeSource.all[0]?.emit('invalidate', { keys: KEYS });

    expect(invalidated).toEqual([KEYS]);
  });

  it('reports a frame it cannot read and keeps going', async () => {
    const { invalidated, errors } = start();
    await flush();

    FakeSource.all[0]?.emitRaw('invalidate', 'not json');
    FakeSource.all[0]?.emit('invalidate', { keys: 'cards' });
    FakeSource.all[0]?.emit('invalidate', { keys: KEYS });

    expect(errors.map((e) => e.kind)).toEqual(['payload', 'payload']);
    expect(invalidated).toEqual([KEYS]);
  });

  it('says it is open, and does not ask for a resync on the first open', async () => {
    const { states, resyncs } = start();
    await flush();
    FakeSource.all[0]?.open();

    expect(states).toEqual(['connecting', 'open']);
    expect(resyncs).toEqual([]);
  });

  it('reconnects with a fresh ticket and asks for a resync once it is back', async () => {
    const { states, resyncs } = start();
    await flush();
    FakeSource.all[0]?.open();

    FakeSource.all[0]?.drop();
    await vi.advanceTimersByTimeAsync(10);

    expect(FakeSource.all).toHaveLength(2);
    expect(FakeSource.all[1]?.url).toBe('/api/projects/demo/events?ticket=t2');
    expect(states.at(-1)).toBe('connecting');
    expect(resyncs).toEqual([]);

    FakeSource.all[1]?.open();

    expect(resyncs).toEqual([2]);
    expect(states.at(-1)).toBe('open');
  });

  it('reports reconnecting while the browser retries on its own, then resyncs', async () => {
    const { states, resyncs } = start();
    await flush();
    FakeSource.all[0]?.open();

    FakeSource.all[0]?.blip();
    expect(states.at(-1)).toBe('reconnecting');

    FakeSource.all[0]?.open();
    expect(states.at(-1)).toBe('open');
    expect(resyncs).toHaveLength(1);
  });

  it('keeps retrying with a growing delay when the network is down', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const delays: number[] = [];
    const { errors } = start({
      fetch,
      backoffMs: (attempt) => {
        delays.push(attempt);

        return 10;
      },
    });

    await flush();
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);

    expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(delays.slice(0, 3)).toEqual([1, 2, 3]);
    expect(errors).toEqual([]);
  });

  it('stops and reports a refusal that asking again will not fix', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: { code: 'project_not_found', message: 'no' } },
          { status: 404 },
        ),
      );

    const { errors } = start({ fetch });
    await flush();
    await vi.advanceTimersByTimeAsync(1000);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([{ kind: 'http', status: 404 }]);
    expect(FakeSource.all).toHaveLength(0);
  });

  it('stops for good when closed, even with a retry scheduled', async () => {
    const { watch, fetch } = start();
    await flush();
    FakeSource.all[0]?.open();
    FakeSource.all[0]?.drop();

    watch.close();
    await vi.advanceTimersByTimeAsync(100);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(FakeSource.all).toHaveLength(1);
    expect(FakeSource.all[0]?.closed).toBe(true);
  });
});
