/**
 * `useCountdown()`: runs a callback after a delay that can be paused and resumed.
 *
 * Why: a notification the user is reading, hovering or tabbing through must not vanish under
 *   them, and one raised while the tab is in the background must not expire unseen. Pausing
 *   keeps the time left rather than restarting, and a new revision of the same notification
 *   (an update) starts the full delay again.
 *
 * Exports: useCountdown().
 * Depends on: react. No IO beyond timers.
 */

import { useEffect, useRef } from 'react';

/**
 * Calls `onExpire` once `durationMs` of un-paused time has passed since `revision` last
 * changed. A `null` duration never expires.
 */
export function useCountdown(
  durationMs: number | null,
  paused: boolean,
  revision: number,
  onExpire: () => void,
): void {
  const remaining = useRef(durationMs ?? 0);
  const expire = useRef(onExpire);

  useEffect(() => {
    expire.current = onExpire;
  });

  // Declared before the timer effect: on a new revision, cleanups run first (banking the
  // time used), then this resets the budget, then the timer starts from the full delay.
  useEffect(() => {
    remaining.current = durationMs ?? 0;
  }, [durationMs, revision]);

  useEffect(() => {
    if (durationMs === null || paused) {
      return undefined;
    }

    const startedAt = Date.now();
    const timer = setTimeout(() => expire.current(), remaining.current);

    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [durationMs, paused, revision]);
}
