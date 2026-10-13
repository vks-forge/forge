/**
 * Clock port — time and cancellable timers as an injected dependency.
 *
 * Why: stalls, backoff windows, wake `not_before` times and the 3-per-hour re-wake cap are
 *   all decisions about time. If the engine and drivers read `Date.now()` and
 *   `setTimeout` directly, tests either wait in real time or flake. Injecting a clock lets a
 *   test advance time by hand and lets the engine stay free of timers: the app owns the real
 *   clock and drives ticks with it (director-core.md §2).
 *
 * Exports: Clock.
 * Depends on: nothing. Types only.
 */

/** Epoch-millisecond time source with cancellable timers. */
export interface Clock {
  now(): number;
  /** Runs `fn` after `ms`; the returned function cancels it. */
  after(ms: number, fn: () => void): () => void;
}
