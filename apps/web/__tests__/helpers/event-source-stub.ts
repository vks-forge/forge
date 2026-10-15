/**
 * `stubEventSource()`: a scripted browser `EventSource` for the live Worker thread.
 *
 * Why: the thread follows a run over server-sent events, and jsdom has no `EventSource`. The
 *   app's own watcher (`watchRunEvents`, ticket fetch and all) runs unchanged; this stub only
 *   replaces the browser class under it. Each run id maps to a list of events: they are
 *   delivered one after another once the source opens, resuming after `?after=<seq>` like the
 *   server, and a script that ends in `finish` or `error` is followed by the `end` frame, so
 *   a finished run closes while a script without an ending stays open like a Worker still
 *   working. A run with no script recorded nothing and ends at once. Tests can also push a frame by hand (`emit`) or make the browser give up
 *   (`drop`) to stage a noisy or lost stream.
 *
 * Exports: stubEventSource(), StubSource, EventSourceStub.
 * Depends on: vitest (vi.stubGlobal), @forge/core (RunEvent type). No network.
 */

import type { RunEvent } from '@forge/core';
import { vi } from 'vitest';

type Listener = (event: MessageEvent<string>) => void;

/** One open stream, as the watcher sees it. */
export interface StubSource {
  readonly url: string;
  readonly runId: string;
  readyState: number;
  closed: boolean;
  /** Delivers a frame by hand: `type` is the SSE event name, `data` is JSON-encoded. */
  emit(type: string, data: unknown): void;
  /** The browser gave up (ticket refused, 204, network down). */
  drop(): void;
}

export interface EventSourceStub {
  /** Every source opened so far, oldest first. */
  readonly sources: StubSource[];
}

const CLOSED = 2;

/** Installs the stub as `globalThis.EventSource`; the test setup removes it after each test. */
export function stubEventSource(
  scripts: Readonly<Record<string, readonly RunEvent[]>>,
): EventSourceStub {
  const sources: StubSource[] = [];

  class Source implements StubSource {
    readyState = 0;
    closed = false;
    onopen: ((event: unknown) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    readonly runId: string;
    private readonly listeners = new Map<string, Listener[]>();
    private readonly timers: ReturnType<typeof setTimeout>[] = [];

    constructor(readonly url: string) {
      const parsed = new URL(url, 'http://forge.test');
      this.runId = decodeURIComponent(parsed.pathname.split('/').at(-2) ?? '');
      const after = Number(parsed.searchParams.get('after') ?? 0);
      sources.push(this);
      this.timers.push(setTimeout(() => this.play(after), 0));
    }

    addEventListener(type: string, listener: Listener): void {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }

    close(): void {
      this.closed = true;
      this.readyState = CLOSED;
      for (const timer of this.timers) {
        clearTimeout(timer);
      }
    }

    emit(type: string, data: unknown): void {
      for (const listener of this.listeners.get(type) ?? []) {
        listener({ data: JSON.stringify(data) } as MessageEvent<string>);
      }
    }

    drop(): void {
      this.readyState = CLOSED;
      this.onerror?.({});
    }

    private play(after: number): void {
      if (this.closed) {
        return;
      }

      this.readyState = 1;
      this.onopen?.({});
      const events = (scripts[this.runId] ?? []).filter((event) => event.seq > after);
      const last = scripts[this.runId]?.at(-1);
      events.forEach((event, index) => {
        this.timers.push(setTimeout(() => this.emit(event.type, event), index));
      });

      if (last === undefined) {
        // A run that recorded nothing is over: the server replays zero events and ends.
        this.timers.push(setTimeout(() => this.emit('end', { status: 'success' }), 0));
      } else if (last.type === 'finish' || last.type === 'error') {
        this.timers.push(
          setTimeout(
            () =>
              this.emit('end', { status: last.type === 'error' ? 'error' : 'success' }),
            events.length,
          ),
        );
      }
    }
  }

  vi.stubGlobal('EventSource', Source);

  return { sources };
}
