/**
 * Tests for the writer mutex.
 *
 * Why: every storage transaction and receipt append queues on this mutex. A task that
 *   re-enters it waits forever on itself and freezes the whole Director, so re-entry must
 *   fail immediately with a typed error, while ordinary queued callers still run strictly
 *   in order and a failing task never wedges the queue.
 *
 * Pins: call-order execution, failure isolation, immediate InvalidInputError on re-entry
 *   (including after an await), and that two mutexes do not see each other as nested.
 * Depends on: src/shared/mutex, @forge/core, vitest.
 */

import { InvalidInputError } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { createMutex } from '#/shared/mutex.js';

describe('createMutex', () => {
  it('runs tasks in call order and survives a failing task', async () => {
    const m = createMutex();
    const order: number[] = [];
    const a = m.run(async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push(1);
      throw new Error('boom');
    });
    const b = m.run(async () => {
      order.push(2);
      return 'b';
    });
    await expect(a).rejects.toThrow('boom');
    await expect(b).resolves.toBe('b');
    expect(order).toEqual([1, 2]);
  });

  it('rejects a re-entrant run immediately with InvalidInputError', async () => {
    const m = createMutex();
    const outcome = await Promise.race([
      m
        .run(async () => {
          await Promise.resolve();
          return m.run(async () => 'inner');
        })
        .catch((e: unknown) => e),
      new Promise((r) => setTimeout(() => r('deadlock'), 500)),
    ]);
    expect(outcome).toBeInstanceOf(InvalidInputError);
  });

  it('does not treat a different mutex as nested, and is reusable afterwards', async () => {
    const a = createMutex();
    const b = createMutex();
    expect(await a.run(() => b.run(async () => 'ok'))).toBe('ok');
    await expect(a.run(async () => 1)).resolves.toBe(1);
  });
});
