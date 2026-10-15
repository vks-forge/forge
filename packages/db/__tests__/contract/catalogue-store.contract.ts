/**
 * CatalogueStore contract: one suite every tool-catalogue backend must pass.
 *
 * Why: the server builds each run's tool policy from this store and the owner edits it in
 *   Settings. What must hold in every backend: a fresh store already holds the built-in
 *   catalogue as version 1 (so a first start has tools); each save is the next version and
 *   old versions read back unchanged (a run's recorded catalogue hash maps to one
 *   document); a save from a stale screen is refused with a typed conflict, and of two
 *   racing saves exactly one wins; and a document that would leave no usable catalogue
 *   (duplicate id, invalid entry) or a save without an author and reason is refused before
 *   it is stored (d-0085).
 *
 * Exports: describeCatalogueStoreContract(), CatalogueStoreHandle.
 * Depends on: vitest, @forge/core, @forge/tools. IO only through the store under test.
 */

import { ConfigVersionConflictError, InvalidInputError } from '@forge/core';
import { BUILT_IN_CATALOGUE } from '@forge/tools';
import type { CatalogueDoc, CatalogueStore } from '@forge/tools';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

export interface CatalogueStoreHandle {
  readonly store: CatalogueStore;
  close(): Promise<void> | void;
}

const without = (id: string): CatalogueDoc => ({
  entries: BUILT_IN_CATALOGUE.entries.filter((e) => e.id !== id),
});

const save = (store: CatalogueStore, doc: unknown, expectedVersion: number) =>
  store.append({
    doc: doc as CatalogueDoc,
    author: 'tester',
    reason: 'because',
    expectedVersion,
  });

/** Register the shared contract; `make` must return a fresh store each call. */
export function describeCatalogueStoreContract(
  name: string,
  make: () => Promise<CatalogueStoreHandle> | CatalogueStoreHandle,
): void {
  describe(`CatalogueStore contract: ${name}`, () => {
    let handle: CatalogueStoreHandle;
    let store: CatalogueStore;
    beforeEach(async () => {
      handle = await make();
      store = handle.store;
    });

    afterEach(async () => {
      await handle.close();
    });

    it('starts with the built-in catalogue as version 1', async () => {
      const current = await store.current();

      expect(current.version).toBe(1);
      expect(current.doc).toEqual(BUILT_IN_CATALOGUE);
      expect(current.author).toBe('forge');
      expect((await store.history()).map((v) => v.version)).toEqual([1]);
    });

    it('saves the next version and keeps the old one readable', async () => {
      const edited = without('mcp__forge__web_fetch');
      const saved = await save(store, edited, 1);

      expect(saved.version).toBe(2);
      expect(saved.doc).toEqual(edited);
      expect((await store.current()).version).toBe(2);
      const history = await store.history();

      expect(history.map((v) => v.version)).toEqual([1, 2]);
      expect(history[0]?.doc).toEqual(BUILT_IN_CATALOGUE);
      expect(history[1]).toMatchObject({ author: 'tester', reason: 'because' });
    });

    it('refuses a save from a stale version with a typed conflict', async () => {
      await save(store, without('mcp__forge__web_fetch'), 1);

      await expect(save(store, without('mcp__forge__web_search'), 1)).rejects.toThrow(
        ConfigVersionConflictError,
      );

      expect((await store.current()).version).toBe(2);
    });

    it('lets exactly one of two racing saves win', async () => {
      const results = await Promise.allSettled([
        save(store, without('mcp__forge__web_fetch'), 1),
        save(store, without('mcp__forge__web_search'), 1),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect((await store.history()).map((v) => v.version)).toEqual([1, 2]);
    });

    it('refuses a document that is not a usable catalogue and stores nothing', async () => {
      const first = BUILT_IN_CATALOGUE.entries[0];
      const dup = { entries: [...BUILT_IN_CATALOGUE.entries, first] };

      await expect(save(store, dup, 1)).rejects.toThrow(InvalidInputError);
      await expect(save(store, { entries: [] }, 1)).rejects.toThrow(InvalidInputError);
      await expect(save(store, { entries: [{ id: 'x' }] }, 1)).rejects.toThrow(
        InvalidInputError,
      );

      expect((await store.current()).version).toBe(1);
    });

    it('refuses a save without an author or a reason', async () => {
      const doc = without('mcp__forge__web_fetch');

      await expect(
        store.append({ doc, author: ' ', reason: 'r', expectedVersion: 1 }),
      ).rejects.toThrow(InvalidInputError);

      await expect(
        store.append({ doc, author: 'a', reason: '', expectedVersion: 1 }),
      ).rejects.toThrow(InvalidInputError);

      expect((await store.history()).map((v) => v.version)).toEqual([1]);
    });

    it('hands out copies, so editing a result cannot change the store', async () => {
      const current = await store.current();
      current.doc.entries.length = 0;

      expect((await store.current()).doc).toEqual(BUILT_IN_CATALOGUE);
    });
  });
}
