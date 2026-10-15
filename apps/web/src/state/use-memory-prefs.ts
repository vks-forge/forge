/**
 * `useMemoryPrefs()`: the memory screen's tab, search text, tag and hide-superseded choices.
 *
 * Why: these are the user's view preferences, not server data, so they sit behind a
 *   `use<Feature>Prefs()` hook (d-0122). The tab, tags and hide-superseded switch persist in
 *   `localStorage` (`forge.ui.memory`) so the screen reopens as the user left it; the search
 *   text stays in a tab-only store, because a stale search box after a reload hides
 *   records and looks like missing data. Until the user picks a tab, `fallbackTab` (for
 *   example Proposals when answers are waiting) is shown.
 *
 * Exports: useMemoryPrefs(), memoryPrefsStore.
 * Depends on: state/create-persisted-store, state/create-transient-store, domain/memory-filter,
 *   schemas/ui-state, types/memory.types, types/ui-state.types.
 */

import { DEFAULT_FILTER } from '#/domain/memory-filter.js';
import { MemoryPrefsSchema } from '#/schemas/ui-state.js';
import { createPersistedStore } from '#/state/create-persisted-store.js';
import { createTransientStore } from '#/state/create-transient-store.js';
import type { MemoryFilter, MemoryTab } from '#/types/memory.types.js';
import type { MemoryPrefs } from '#/types/ui-state.types.js';

export const memoryPrefsStore = createPersistedStore<MemoryPrefs>({
  name: 'memory',
  version: 1,
  initial: { chosen: null },
  schema: MemoryPrefsSchema,
});

const searchStore = createTransientStore({ text: '' });

function setFilter(next: MemoryFilter): void {
  searchStore.setState({ text: next.text });
  memoryPrefsStore.setState((previous) => {
    // Tags belong to one tab; switching tab clears them so no hidden filter empties the list.
    const tags = previous.chosen && previous.chosen.tab !== next.tab ? [] : next.tags;

    return { chosen: { tab: next.tab, tags, activeOnly: next.activeOnly } };
  });
}

/** The current filter and a setter. */
export function useMemoryPrefs(fallbackTab: MemoryTab): {
  filter: MemoryFilter;
  setFilter: (next: MemoryFilter) => void;
} {
  const chosen = memoryPrefsStore((p) => p.chosen);
  const text = searchStore((s) => s.text);
  const filter: MemoryFilter = chosen
    ? { ...chosen, text }
    : { ...DEFAULT_FILTER, tab: fallbackTab, text };

  return { filter, setFilter };
}
