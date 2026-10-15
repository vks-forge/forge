/**
 * `useOnline()`: whether the browser currently has a network connection.
 *
 * Why: a settings save or a proposal answer that fails because the laptop is offline should
 *   say so before the user clicks, not after a spinner. Screens that write read this to show
 *   an offline notice and hold their write buttons. It reports the browser's own signal, which
 *   can say "online" when Forge itself is down; that case is the ordinary error state.
 *
 * Exports: useOnline().
 * Depends on: react. IO: `online` and `offline` window events.
 */

import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);

  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
