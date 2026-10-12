/**
 * Mutex interface for serializing async storage transactions.
 *
 * Why: the implementation lives in shared/mutex.ts; the interface sits here because
 *   hand-written types live under types/ (code.md rule 10).
 *
 * Exports: Mutex.
 * Depends on: nothing. Types only.
 */

/** Serializes async work; a failed task never blocks the next one. */
export interface Mutex {
  run<T>(task: () => Promise<T>): Promise<T>;
}
