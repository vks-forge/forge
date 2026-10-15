/**
 * `createUiStore()` and `resetUiState()`: in-memory stores for UI state, read with
 * `useSyncExternalStore`.
 *
 * Why: board filters, thread preferences and answer drafts must be shared by sibling
 *   components and survive the component that wrote them unmounting. Plain React state
 *   cannot do that, a small external store can. Nothing here touches browser storage and
 *   nothing server-side (tickets, run content) ever goes in; d-0122 swaps these stores for
 *   persisted zustand ones behind the same hooks.
 *
 * Exports: createUiStore(), useUiStore(), resetUiState().
 * Depends on: react, types/store.types.
 */

import { useSyncExternalStore } from 'react';
import type { UiStore } from '#/types/store.types.js';

const all = new Set<UiStore<unknown>>();

export function createUiStore<T>(initial: T): UiStore<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  const store: UiStore<T> = {
    get: () => state,
    set(next) {
      const value = typeof next === 'function' ? (next as (p: T) => T)(state) : next;
      if (!Object.is(value, state)) {
        state = value;
        notify();
      }
    },
    subscribe(listener) {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    reset() {
      state = initial;
      notify();
    },
  };

  all.add(store as UiStore<unknown>);

  return store;
}

/** Current value of a store; re-renders when it changes. */
export function useUiStore<T>(store: UiStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/** Puts every store back to its initial value. For tests. */
export function resetUiState(): void {
  for (const store of all) {
    store.reset();
  }
}
