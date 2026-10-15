/**
 * `useStatsPrefs()`: the range (7, 30 or 90 days) Home and Cost are showing.
 *
 * Why: the range is a view preference, not server data, so the client-state decision (d-0122)
 *   keeps it behind a `use<Feature>Prefs()` hook whose storage can change without touching the
 *   screens. Today it is plain React state: it resets on reload and defaults to 30 days, the
 *   same default the server uses.
 *
 * Exports: useStatsPrefs().
 * Depends on: react, @forge/core (StatsRange type).
 */

import { useState } from 'react';
import type { StatsRange } from '@forge/core';

export function useStatsPrefs(): {
  range: StatsRange;
  setRange: (next: StatsRange) => void;
} {
  const [range, setRange] = useState<StatsRange>('30d');

  return { range, setRange };
}
