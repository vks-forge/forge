/**
 * `createTransientStore()`: a zustand store that lives only as long as the tab.
 *
 * Why: some UI state is shared between sibling components but is not worth keeping across a
 *   reload (a search box's text). It is the same kind of store as the persisted ones, so a
 *   feature can move a field between the two by changing one call, and it registers for the
 *   same test reset.
 *
 * Exports: createTransientStore().
 * Depends on: zustand, state/ui-store-registry. No IO.
 */

import { create } from 'zustand';
import { registerUiStore } from '#/state/ui-store-registry.js';

export function createTransientStore<T extends object>(initial: T) {
  const store = create<T>()(() => initial);

  registerUiStore(() => store.setState(initial, true));

  return store;
}
