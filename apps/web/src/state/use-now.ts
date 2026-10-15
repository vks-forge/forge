/**
 * `useNow()`: the current time, refreshed on a timer.
 *
 * Why: "4 min ago" labels on Board cards and runs must keep moving without a data refetch,
 *   and a label computed once at render would be wrong a minute later. One hook owns the
 *   timer so a screen re-renders at most every `everyMs`, not on every frame.
 *
 * Exports: useNow().
 * Depends on: react.
 */

import { useEffect, useState } from 'react';

/** Milliseconds since the epoch, refreshed every `everyMs` (default 30 s). */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);

    return () => clearInterval(timer);
  }, [everyMs]);

  return now;
}
