/**
 * Serial queue tests — one write in flight per project.
 *
 * Why: two memory writes to one project that overlap would pick the same id or race on
 *   the index and the commit. The queue must run a key's tasks strictly one after the
 *   other, keep going after a failure, and not make different projects wait for each other.
 *
 * Pins: createSerialQueue ordering, failure isolation, key independence.
 * Depends on: shared/serial-queue, vitest. No IO.
 */

import { describe, expect, it } from 'vitest';
import { createSerialQueue } from '#/shared/serial-queue.js';

const tick = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('createSerialQueue', () => {
  it('never runs two tasks of one key at once, in submission order', async () => {
    const q = createSerialQueue();
    const log: string[] = [];
    let running = 0;
    let peak = 0;
    const task = (name: string, ms: number) => async () => {
      running += 1;
      peak = Math.max(peak, running);
      log.push(`start ${name}`);
      await tick(ms);
      log.push(`end ${name}`);
      running -= 1;
    };

    await Promise.all([
      q.run('a', task('1', 20)),
      q.run('a', task('2', 1)),
      q.run('a', task('3', 1)),
    ]);

    expect(peak).toBe(1);
    expect(log).toEqual(['start 1', 'end 1', 'start 2', 'end 2', 'start 3', 'end 3']);
  });

  it('runs the next task after one fails, and reports the failure to its caller', async () => {
    const q = createSerialQueue();
    const failing = q.run('a', () => Promise.reject(new Error('boom')));
    const after = q.run('a', () => Promise.resolve('ok'));

    await expect(failing).rejects.toThrow('boom');
    await expect(after).resolves.toBe('ok');
  });

  it('lets different keys run in parallel', async () => {
    const q = createSerialQueue();
    let release: () => void = () => undefined;
    const held = q.run('a', () => new Promise<void>((r) => (release = r)));

    await expect(q.run('b', () => Promise.resolve('b done'))).resolves.toBe('b done');
    release();
    await held;
  });
});
