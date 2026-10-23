/**
 * `useElapsed(startedAt)`: milliseconds since an ISO time, ticking once a second while the tab shows.
 *
 * Why: a running Worker's tile says "10m 03s" and that number must move to prove the run is alive
 *   (visibility of system status), without refetching anything: the server sends the start time
 *   once and the clock is local. A hidden tab pauses the timer so a Board left open in a
 *   background tab does no work, and it catches up at once when the tab returns. No start time
 *   (nothing running) returns null and sets no timer.
 *
 * Exports: useElapsed().
 * Depends on: react.
 */

import { useEffect, useState } from 'react';

export function useElapsed(startedAt: string | undefined): number | null {
  const start = startedAt === undefined ? Number.NaN : Date.parse(startedAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (Number.isNaN(start)) {
      return undefined;
    }

    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = (): void => {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };

    const begin = (): void => {
      stop();
      setNow(Date.now());
      timer = setInterval(() => setNow(Date.now()), 1000);
    };

    const onVisibility = (): void => {
      if (document.hidden) {
        stop();
      } else {
        begin();
      }
    };

    if (!document.hidden) {
      begin();
    }

    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [start]);

  return Number.isNaN(start) ? null : Math.max(0, now - start);
}
