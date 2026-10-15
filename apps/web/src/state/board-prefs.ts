/**
 * `useBoardPrefs()`: the Board's view mode and filter.
 *
 * Why: the filter above the columns and the Cards | Tickets switch are the user's way of
 *   narrowing the Board; they must not reset when a card is opened and the user comes back.
 *   The hook is the only door to that state (d-0122): today in memory, later a persisted
 *   zustand store, with no caller changes. Preferences only: never ticket data.
 *
 * Exports: useBoardPrefs().
 * Depends on: state/ui-store, domain/board-columns, types/board.types, types/ui-state.types.
 */

import { EMPTY_FILTER } from '#/domain/board-columns.js';
import { createUiStore, useUiStore } from '#/state/ui-store.js';
import type { BoardFilter } from '#/types/board.types.js';
import type { BoardPrefs } from '#/types/ui-state.types.js';

const store = createUiStore<BoardPrefs>({ view: 'tickets', filter: EMPTY_FILTER });

export function useBoardPrefs() {
  const prefs = useUiStore(store);

  return {
    view: prefs.view,
    filter: prefs.filter,
    setView: (view: BoardPrefs['view']): void => store.set((p) => ({ ...p, view })),
    setFilter: (patch: Partial<BoardFilter>): void =>
      store.set((p) => ({ ...p, filter: { ...p.filter, ...patch } })),
    resetFilter: (): void => store.set((p) => ({ ...p, filter: EMPTY_FILTER })),
  };
}
