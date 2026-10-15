/**
 * Pins: the stream helper reports connecting, open and reconnecting to the page.
 *
 * Why: a quiet run and a dead connection look the same on screen. Without these states the
 *   Ticket thread could not say "Connection lost, reconnecting" and a user would wait on a
 *   Worker that is not coming.
 * Depends on: src/api/sse/watch-run-events. Fake fetch, fake EventSource, fake timers.
 */

import { describe, expect, it, vi } from 'vitest';
import { watchRunEvents } from '#/api/sse/watch-run-events.js';

describe('watchRunEvents connection state', () => {
  it('reports connecting, open and reconnecting', async () => {
    vi.useFakeTimers();
    try {
      type Handlers = { onopen: (() => void) | null; onerror: (() => void) | null };
      const sources: (Handlers & { readyState: number })[] = [];

      class Source {
        readyState = 1;
        onopen: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor() {
          sources.push(this);
        }
        addEventListener(): void {}
        close(): void {
          this.readyState = 2;
        }
      }

      const states: string[] = [];
      const watch = watchRunEvents({
        runId: 'r',
        baseUrl: '/api',
        fetch: vi
          .fn()
          .mockImplementation(() =>
            Promise.resolve(Response.json({ ticket: 't', expires_in_s: 60 })),
          ),
        EventSource: Source as never,
        backoffMs: () => 10,
        onEvent: () => undefined,
        onEnd: () => undefined,
        onError: () => undefined,
        onConnection: (s) => states.push(s),
      });

      await vi.advanceTimersByTimeAsync(0);
      sources[0]?.onopen?.();
      sources[0]!.readyState = 2;
      sources[0]?.onerror?.();
      await vi.advanceTimersByTimeAsync(20);

      expect(states).toEqual(['connecting', 'open', 'reconnecting', 'connecting']);
      watch.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
