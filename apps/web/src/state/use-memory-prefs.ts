/**
 * `useMemoryPrefs()`: the memory screen's tab, search text, tag and hide-superseded choices.
 *
 * Why: these are the user's view preferences, not server data, and the client-state decision
 *   (d-0122) puts view preferences behind `use<Feature>Prefs()` hooks so their storage can
 *   change without touching the screen. Today they are plain React state, so they reset when
 *   the page reloads; the screen only ever calls this hook, never storage.
 *
 * Exports: useMemoryPrefs().
 * Depends on: react, domain/memory-filter, types/memory.types.
 */

import { useCallback, useState } from 'react';
import { DEFAULT_FILTER } from '#/domain/memory-filter.js';
import type { MemoryFilter, MemoryTab } from '#/types/memory.types.js';

/**
 * The current filter and a setter. Until the user picks a tab, `fallbackTab` (for example
 * Proposals when answers are waiting) is shown.
 */
export function useMemoryPrefs(fallbackTab: MemoryTab): {
  filter: MemoryFilter;
  setFilter: (next: MemoryFilter) => void;
} {
  const [chosen, setChosen] = useState<MemoryFilter | null>(null);
  const filter = chosen ?? { ...DEFAULT_FILTER, tab: fallbackTab };

  const setFilter = useCallback((next: MemoryFilter) => {
    setChosen((previous) =>
      // Tags belong to one tab; switching tab clears them so no hidden filter empties the list.
      previous && previous.tab !== next.tab ? { ...next, tags: [] } : next,
    );
  }, []);

  return { filter, setFilter };
}
