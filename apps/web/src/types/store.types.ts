/**
 * The tiny store shape behind the UI-state hooks.
 *
 * Why: UI state (filters, view mode, drafts) must outlive the component that sets it (an
 *   optimistic answer removes its form, yet the typed text must survive a refusal). A store
 *   with `get`, `set` and `subscribe` is what `useSyncExternalStore` needs, and is the shape
 *   a zustand store has, so the hooks in `src/state/` can move to zustand (d-0122) without
 *   their callers changing.
 *
 * Exports: UiStore.
 * Depends on: nothing. Types only.
 */

export interface UiStore<T> {
  get(): T;
  set(next: T | ((previous: T) => T)): void;
  subscribe(listener: () => void): () => void;
  /** Back to the initial value; tests use it between cases. */
  reset(): void;
}
