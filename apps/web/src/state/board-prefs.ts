/**
 * `useBoardPrefs()`: the Board's view mode and filter.
 *
 * Why: the filter above the columns and the Cards | Tickets switch are the user's way of
 *   narrowing the Board; they must not reset when a card is opened and the user comes back,
 *   or when the tab is reloaded. The hook is the only door to that state (d-0122): a
 *   persisted zustand store, saved under `forge.ui.board`. Preferences only: never ticket
 *   data.
 *
 * Exports: useBoardPrefs(), boardPrefsStore.
 * Depends on: state/create-persisted-store, domain/board-columns, schemas/ui-state,
 *   types/board.types, types/ui-state.types.
 */

import { EMPTY_FILTER } from '#/domain/board-columns.js';
import { BoardPrefsSchema } from '#/schemas/ui-state.js';
import { createPersistedStore } from '#/state/create-persisted-store.js';
import type { BoardFilter } from '#/types/board.types.js';
import type { BoardPrefs } from '#/types/ui-state.types.js';

export const boardPrefsStore = createPersistedStore<BoardPrefs>({
  name: 'board',
  version: 1,
  initial: { view: 'tickets', filter: EMPTY_FILTER },
  schema: BoardPrefsSchema,
});

function setView(view: BoardPrefs['view']): void {
  boardPrefsStore.setState({ view });
}

function setFilter(patch: Partial<BoardFilter>): void {
  boardPrefsStore.setState((p) => ({ filter: { ...p.filter, ...patch } }));
}

function resetFilter(): void {
  boardPrefsStore.setState({ filter: EMPTY_FILTER });
}

export function useBoardPrefs() {
  const view = boardPrefsStore((p) => p.view);
  const filter = boardPrefsStore((p) => p.filter);

  return { view, filter, setView, setFilter, resetFilter };
}
