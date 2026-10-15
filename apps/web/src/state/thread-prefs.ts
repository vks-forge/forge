/**
 * `useThreadPrefs()`: how the user wants the live Worker thread to behave.
 *
 * Why: some people want the thread to follow the newest line, others read at their own pace
 *   and find any auto-scroll hostile. "Follow latest" is a choice that must hold from one
 *   ticket to the next, and "expand tool calls" saves opening each one when debugging. The
 *   hook is the only door to that state (d-0122); in memory today, persisted later, no
 *   caller changes. Preferences only: never run content.
 *
 * Exports: useThreadPrefs().
 * Depends on: state/ui-store, types/ui-state.types.
 */

import { createUiStore, useUiStore } from '#/state/ui-store.js';
import type { ThreadPrefs } from '#/types/ui-state.types.js';

const store = createUiStore<ThreadPrefs>({ followLatest: true, expandTools: false });

export function useThreadPrefs() {
  const prefs = useUiStore(store);

  return {
    followLatest: prefs.followLatest,
    expandTools: prefs.expandTools,
    setFollowLatest: (followLatest: boolean): void =>
      store.set((p) => ({ ...p, followLatest })),
    setExpandTools: (expandTools: boolean): void =>
      store.set((p) => ({ ...p, expandTools })),
  };
}
