/**
 * `registerUiStore()` and `resetUiState()`: the list of every UI store, so tests can reset them.
 *
 * Why: UI stores are module-level singletons, created when their file is first imported. A
 *   test that changes a filter or a draft must not leak it into the next test, and no test
 *   should have to know which stores exist. Each store registers a reset function here when
 *   it is created.
 *
 * Exports: registerUiStore(), resetUiState().
 * Depends on: nothing. No IO.
 */

const resets = new Set<() => void>();

/** Called by the store factories; `reset` puts the store back to its defaults. */
export function registerUiStore(reset: () => void): void {
  resets.add(reset);
}

/** Puts every UI store back to its defaults. For tests. */
export function resetUiState(): void {
  for (const reset of resets) {
    reset();
  }
}
