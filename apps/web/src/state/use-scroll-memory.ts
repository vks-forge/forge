/**
 * `useScrollMemory()` and `useRestoreScroll()`: each tab of a page keeps its scroll position.
 *
 * Why: switching from Plan to Details and back should not throw the reader to the top of a
 *   long plan. A tab's panel unmounts when another opens, so its position is parked in a map
 *   the page owns (it lives as long as the page is open, then goes with it) and put back when
 *   the panel mounts again. The chat tab parks `-1` when it was at the newest line, so it
 *   keeps following the thread instead of freezing at an old offset.
 *
 * Exports: useScrollMemory(), useRestoreScroll().
 * Depends on: react, types/route-tabs.types.
 */

import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { ScrollMemory } from '#/types/route-tabs.types.js';

/** One memory per page instance. */
export function useScrollMemory(): ScrollMemory {
  const [memory] = useState<ScrollMemory>(() => new Map());

  return memory;
}

/** Puts back the saved position when the panel mounts; returns the scroll handler that saves it. */
export function useRestoreScroll(
  ref: RefObject<HTMLElement | null>,
  memory: ScrollMemory,
  key: string,
): () => void {
  useLayoutEffect(() => {
    const saved = memory.get(key);
    if (ref.current && saved !== undefined && saved > 0) {
      ref.current.scrollTop = saved;
    }
  }, [ref, memory, key]);

  return () => {
    if (ref.current) {
      memory.set(key, ref.current.scrollTop);
    }
  };
}
