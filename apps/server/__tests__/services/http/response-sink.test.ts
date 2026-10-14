/**
 * The SSE response sink: backpressure without leaking listeners.
 *
 * Why: a stream writes frames for the life of a run. When the socket buffer is full the
 * writer waits for `drain` or `close`; if each wait left the loser's listener attached, a
 * slow client would pile up listeners on one response and Node would warn about a leak.
 *
 * Pins: a full buffer resumes on drain or on close and leaves no listener behind; writes
 * after the response closed or ended are dropped.
 * Depends on: src/services/http/response-sink. No IO.
 */

import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { responseSink } from '#/services/http/response-sink.js';

class FakeResponse extends EventEmitter {
  destroyed = false;
  writableEnded = false;
  readonly written: string[] = [];
  constructor(private readonly full: boolean) {
    super();
  }

  write(chunk: string): boolean {
    this.written.push(chunk);

    return !this.full;
  }
}

const asResponse = (r: FakeResponse): ServerResponse => r as unknown as ServerResponse;

describe('responseSink', () => {
  it('writes straight through when the buffer has room', async () => {
    const res = new FakeResponse(false);

    await responseSink(asResponse(res)).write('a');

    expect(res.written).toEqual(['a']);
    expect(res.listenerCount('drain')).toBe(0);
  });

  it('waits for drain and removes the close listener it added', async () => {
    const res = new FakeResponse(true);
    const pending = responseSink(asResponse(res)).write('a');
    await new Promise((resolve) => setImmediate(resolve));

    expect(res.listenerCount('drain')).toBe(1);
    expect(res.listenerCount('close')).toBe(1);
    res.emit('drain');
    await pending;

    expect(res.listenerCount('drain')).toBe(0);
    expect(res.listenerCount('close')).toBe(0);
  });

  it('stops waiting when the client closes and removes the drain listener', async () => {
    const res = new FakeResponse(true);
    const pending = responseSink(asResponse(res)).write('a');
    await new Promise((resolve) => setImmediate(resolve));
    res.emit('close');
    await pending;

    expect(res.listenerCount('drain')).toBe(0);
    expect(res.listenerCount('close')).toBe(0);
  });

  it('does not accumulate listeners over many slow writes', async () => {
    const res = new FakeResponse(true);
    const sink = responseSink(asResponse(res));
    for (let i = 0; i < 25; i++) {
      const pending = sink.write(`frame ${i}`);
      await new Promise((resolve) => setImmediate(resolve));
      res.emit('drain');
      await pending;
    }

    expect(res.listenerCount('close')).toBe(0);
    expect(res.listenerCount('drain')).toBe(0);
  });

  it('drops a write after the response closed or ended', async () => {
    const closed = new FakeResponse(false);
    closed.destroyed = true;
    const ended = new FakeResponse(false);
    ended.writableEnded = true;

    await responseSink(asResponse(closed)).write('a');
    await responseSink(asResponse(ended)).write('b');

    expect(closed.written).toEqual([]);
    expect(ended.written).toEqual([]);
  });
});
