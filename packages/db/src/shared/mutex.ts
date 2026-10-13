/**
 * Promise mutex: runs async tasks one at a time, in call order, and refuses re-entry.
 *
 * Why: the single-writer rule must hold even though a transaction spans awaits and a
 *   connection lock protects only individual statements. Without queuing, two async
 *   transactions could interleave on one connection and commit each other's
 *   half-finished writes. The mutex runs them strictly in call order, and a failing task
 *   must not block those behind it, or one thrown error would freeze the Director
 *   (director-core.md §2-§3). A task that calls back into the same mutex (a transaction
 *   opened inside a transaction, a receipt append inside a storage callback) would wait
 *   for itself forever and silently freeze the Director, so that call is detected with
 *   AsyncLocalStorage and rejected at once with an InvalidInputError.
 *
 * Exports: createMutex().
 * Depends on: types/mutex.types, @forge/core, node:async_hooks. No IO.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { InvalidInputError } from '@forge/core';
import type { Mutex } from '#/types/mutex.types.js';

export function createMutex(): Mutex {
  let tail: Promise<unknown> = Promise.resolve();
  // One store per mutex, so holding mutex A never makes a call into mutex B look nested.
  const held = new AsyncLocalStorage<true>();
  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      if (held.getStore() === true) {
        return Promise.reject(
          new InvalidInputError(
            're-entrant call: a storage transaction or receipt append was started from inside another one on the same writer; it would wait for itself forever',
          ),
        );
      }
      const start = (): Promise<T> => held.run(true, task);
      const result = tail.then(start, start);
      tail = result.catch(() => undefined);
      return result;
    },
  };
}
