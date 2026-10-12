/**
 * Mutex interface for serializing async storage transactions.
 *
 * Why: both storage adapters serialize transactions through the same single-writer queue
 *   (director-core.md §2-§3). The contract states the property that matters: tasks run
 *   one at a time in call order, and a failed task does not block the next.
 *
 * Exports: Mutex.
 * Depends on: nothing. Types only.
 */

/** Serializes async work; a failed task never blocks the next one. */
export interface Mutex {
  run<T>(task: () => Promise<T>): Promise<T>;
}
