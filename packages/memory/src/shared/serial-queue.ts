/**
 * Per-key serial queue: one task at a time for each key, different keys in parallel.
 *
 * Why: two memory writes to one project that interleave would both pick the same next id
 *   or race on the index file and the commit. The Director, the API and a tick can all
 *   write at once, so each project's writes are queued behind each other. A task that
 *   fails does not block the ones behind it.
 *
 * Exports: createSerialQueue().
 * Depends on: types/project-memory (SerialQueue). No IO.
 */

import type { SerialQueue } from '#/types/project-memory.types.js';

export function createSerialQueue(): SerialQueue {
  const tails = new Map<string, Promise<unknown>>();

  return {
    run<T>(key: string, task: () => Promise<T>): Promise<T> {
      const previous = tails.get(key) ?? Promise.resolve();
      const result = previous.then(task, task);
      const tail = result.then(
        () => undefined,
        () => undefined,
      );

      tails.set(key, tail);
      void tail.then(() => {
        if (tails.get(key) === tail) {
          tails.delete(key);
        }
      });

      return result;
    },
  };
}
