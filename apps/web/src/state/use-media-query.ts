/**
 * `useMediaQuery()`: subscribes a component to a CSS media query.
 *
 * Why: the sidebar is a permanent column on wide screens and a slide-in drawer on narrow ones
 *   (320 to 768 px must never scroll sideways), and the two need different markup and focus
 *   behaviour, which CSS alone cannot give. Environments without `matchMedia` (tests, very
 *   old browsers) report "no match" rather than throwing.
 *
 * Exports: useMediaQuery().
 * Depends on: react. IO: window.matchMedia.
 */

import { useCallback, useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (typeof window.matchMedia !== 'function') {
        return () => undefined;
      }

      const list = window.matchMedia(query);
      list.addEventListener('change', notify);

      return () => list.removeEventListener('change', notify);
    },
    [query],
  );

  const read = useCallback(
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    [query],
  );

  return useSyncExternalStore(subscribe, read, () => false);
}
