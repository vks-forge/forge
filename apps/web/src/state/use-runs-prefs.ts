/**
 * `useRunsPrefs()`: which group of runs (all, active, done, problems) the Runs screen filters to.
 *
 * Why: the filter is a view preference, kept behind a `use<Feature>Prefs()` hook so its storage
 *   can change without touching the screen (d-0122). Today it is plain React state and starts on
 *   "All".
 *
 * Exports: useRunsPrefs().
 * Depends on: react, domain/run-format (type).
 */

import { useState } from 'react';
import type { RunFilterKey } from '#/types/work-ui.types.js';

export function useRunsPrefs(): {
  filter: RunFilterKey;
  setFilter: (next: RunFilterKey) => void;
} {
  const [filter, setFilter] = useState<RunFilterKey>('all');

  return { filter, setFilter };
}
