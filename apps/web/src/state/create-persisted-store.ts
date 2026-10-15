/**
 * `createPersistedStore()`: a zustand store whose data survives a reload.
 *
 * Why: preferences and unsent drafts (theme, last project, board filters, an answer half
 *   typed) should still be there after a refresh, but must never be a way to crash the app
 *   or to leak server data (d-0122). Every persisted UI store is built here so the rules are
 *   in one place: data goes to `localStorage` under `forge.ui.<name>` through a guarded
 *   storage, the saved value carries a version with a `migrate` hook, and whatever is read
 *   back is checked against a schema, so blocked, corrupt, hand-edited or outdated storage
 *   falls back to defaults instead of throwing. Stores hold only data; actions live in the
 *   feature's hook, so everything in the store is exactly what gets saved.
 *
 * Exports: createPersistedStore(), storageKeyOf().
 * Depends on: zustand, state/guarded-storage, state/ui-store-registry,
 *   types/persisted-store.types. IO: localStorage (through the guard).
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { guardedLocalStorage } from '#/state/guarded-storage.js';
import { registerUiStore } from '#/state/ui-store-registry.js';
import type { PersistedStoreOptions } from '#/types/persisted-store.types.js';

/** The `localStorage` key of the store called `name`. */
export function storageKeyOf(name: string): string {
  return `forge.ui.${name}`;
}

export function createPersistedStore<T extends object>(
  options: PersistedStoreOptions<T>,
) {
  const { initial, schema } = options;
  const store = create<T>()(
    persist(() => initial, {
      name: storageKeyOf(options.name),
      version: options.version,
      storage: createJSONStorage<T>(() => guardedLocalStorage),
      migrate: (saved, savedVersion) =>
        (options.migrate ? options.migrate(saved, savedVersion) : initial) as T,
      merge: (saved, current) => {
        const parsed = schema.safeParse(saved);

        return parsed.success ? { ...current, ...parsed.data } : current;
      },
    }),
  );

  registerUiStore(() => store.setState(initial, true));

  return store;
}
