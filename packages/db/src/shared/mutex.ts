/**
 * Promise mutex: runs async tasks one at a time, in call order.
 *
 * Why: StorageAdapter is single-writer (director-core.md §2-§3). Transactions span
 *   awaits, so a connection-level lock is not enough; every adapter queues its
 *   transactions through one mutex.
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
