/**
 * The owner's choice about desktop notifications for new Inbox items, kept per browser.
 *
 * Why: whether this browser may pop up desktop notifications is a property of the browser
 *   (it also holds the permission), not of the Forge server, so it is saved in `localStorage`
 *   through the guarded persisted store and not in Forge's settings. Off by default.
 *
 * Exports: notifyPrefsStore, useBrowserNotifyEnabled(), setBrowserNotify().
 * Depends on: state/create-persisted-store, schemas/ui-state, types/ui-state.types.
 */

import { NotifyPrefsSchema } from '#/schemas/ui-state.js';
import { createPersistedStore } from '#/state/create-persisted-store.js';
import type { NotifyPrefs } from '#/types/ui-state.types.js';

export const notifyPrefsStore = createPersistedStore<NotifyPrefs>({
  name: 'notify',
  version: 1,
  initial: { browser: false },
  schema: NotifyPrefsSchema,
});

export function setBrowserNotify(browser: boolean): void {
  notifyPrefsStore.setState({ browser });
}

export function useBrowserNotifyEnabled(): boolean {
  return notifyPrefsStore((p) => p.browser);
}
