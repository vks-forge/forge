/**
 * `useThreadPrefs()`: how the user wants the live Worker thread to behave.
 *
 * Why: some people want the thread to follow the newest line, others read at their own pace
 *   and find any auto-scroll hostile. "Follow latest" is a choice that must hold from one
 *   ticket to the next and across reloads, and "expand tool calls" saves opening each one
 *   when debugging. The hook is the only door to that state (d-0122): a persisted zustand
 *   store saved under `forge.ui.thread`. Preferences only: never run content.
 *
 * Exports: useThreadPrefs(), threadPrefsStore.
 * Depends on: state/create-persisted-store, schemas/ui-state, types/ui-state.types.
 */

import { ThreadPrefsSchema } from '#/schemas/ui-state.js';
import { createPersistedStore } from '#/state/create-persisted-store.js';
import type { ThreadPrefs } from '#/types/ui-state.types.js';

export const threadPrefsStore = createPersistedStore<ThreadPrefs>({
  name: 'thread',
  version: 1,
  initial: { followLatest: true, expandTools: false },
  schema: ThreadPrefsSchema,
});

function setFollowLatest(followLatest: boolean): void {
  threadPrefsStore.setState({ followLatest });
}

function setExpandTools(expandTools: boolean): void {
  threadPrefsStore.setState({ expandTools });
}

export function useThreadPrefs() {
  const followLatest = threadPrefsStore((p) => p.followLatest);
  const expandTools = threadPrefsStore((p) => p.expandTools);

  return { followLatest, expandTools, setFollowLatest, setExpandTools };
}
