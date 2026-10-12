/**
 * Promise mutex: runs async tasks one at a time, in call order.
 *
 * Why: the single-writer rule must hold even though a transaction spans awaits and a
 *   connection lock protects only individual statements. Without queuing, two async
 *   transactions could interleave on one connection and commit each other's
 *   half-finished writes. The mutex runs them strictly in call order, and a failing task
 *   must not block those behind it, or one thrown error would freeze the Director
 *   (director-core.md §2-§3).
 *
 * Exports: createMutex().
 * Depends on: types/mutex.types. No IO.
 */

import type { Mutex } from '#/types/mutex.types.js';

export function createMutex(): Mutex {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const result = tail.then(task, task);
      tail = result.catch(() => undefined);
      return result;
    },
  };
}
