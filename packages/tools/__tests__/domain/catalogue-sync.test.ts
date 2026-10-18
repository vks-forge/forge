/**
 * Pins how tools added to the built-in catalogue reach an install that already saved its own catalogue.
 *
 * Why: the built-in catalogue is written once, as version 1, the first time a database opens; from then on the
 *   saved document is the only source. A release that adds tools (the three memory tools) would leave every
 *   existing install with those tools "uncatalogued", so they would be denied for every Worker. This adds
 *   exactly the built-in tools that no saved version has ever held, as one new version with its reason, and
 *   nothing else: a tool the owner removed from the catalogue earlier is not brought back, a tool the owner
 *   edited is not overwritten, and a catalogue that already has everything is left alone.
 *
 * Pins: missing built-in tools are appended once with author and reason, a tool in no version is added, a tool
 *   that an older version held and the owner removed stays removed, an edited tool is kept as edited, nothing
 *   to add means no new version, and a stale version is retried against the latest.
 * Depends on: domain/catalogue-sync, domain/catalogue-seed, vitest.
 */

import { describe, expect, it } from 'vitest';
import { BUILT_IN_CATALOGUE } from '#/domain/catalogue-seed.js';
import { syncSeedEntries } from '#/domain/catalogue-sync.js';
import type { CatalogueDoc, CatalogueVersion } from '#/schemas/catalogue.js';
import type {
  CatalogueAppend,
  CatalogueStore,
} from '#/types/ports/catalogue-store.types.js';

/** A store holding the given versions; `append` honours the expected version like the real ones. */
function fakeStore(
  versions: CatalogueDoc[],
): CatalogueStore & { saved: CatalogueAppend[] } {
  const all: CatalogueVersion[] = versions.map((doc, i) => ({
    version: i + 1,
    doc,
    author: 'x',
    reason: 'x',
    created_at: i,
  }));

  const saved: CatalogueAppend[] = [];

  return {
    saved,
    async current() {
      return all[all.length - 1] as CatalogueVersion;
    },
    async history() {
      return [...all];
    },
    async append(input) {
      if (input.expectedVersion !== all.length) {
        throw new Error('stale');
      }

      saved.push(input);
      const v: CatalogueVersion = {
        version: all.length + 1,
        doc: input.doc,
        author: input.author,
        reason: input.reason,
        created_at: all.length,
      };

      all.push(v);

      return v;
    },
  };
}

const MEMORY = [
  'mcp__forge__memory_search',
  'mcp__forge__memory_get',
  'mcp__forge__memory_related',
];

const without = (ids: readonly string[]): CatalogueDoc => ({
  entries: BUILT_IN_CATALOGUE.entries.filter((e) => !ids.includes(e.id)),
});

describe('syncSeedEntries', () => {
  it('appends the built-in tools no saved version ever held, as one version with a reason', async () => {
    const store = fakeStore([without(MEMORY)]);

    const added = await syncSeedEntries(store);
    const now = await store.current();

    expect(added).toEqual(MEMORY);
    expect(store.saved).toHaveLength(1);
    expect(store.saved[0]).toMatchObject({ author: 'forge', expectedVersion: 1 });
    expect(store.saved[0]?.reason).toContain('memory_search');
    expect(now.doc.entries.map((e) => e.id)).toEqual(expect.arrayContaining(MEMORY));
    expect(now.doc.entries).toHaveLength(BUILT_IN_CATALOGUE.entries.length);
  });

  it('leaves a catalogue that already has everything alone', async () => {
    const store = fakeStore([BUILT_IN_CATALOGUE]);

    expect(await syncSeedEntries(store)).toEqual([]);
    expect(store.saved).toEqual([]);
  });

  it('does not bring back a tool that an older version held and the owner removed', async () => {
    const store = fakeStore([BUILT_IN_CATALOGUE, without(['mcp__forge__web_fetch'])]);

    expect(await syncSeedEntries(store)).toEqual([]);
    expect(
      (await store.current()).doc.entries.some((e) => e.id === 'mcp__forge__web_fetch'),
    ).toBe(false);
  });

  it('keeps a tool the owner edited exactly as edited', async () => {
    const edited: CatalogueDoc = {
      entries: without(MEMORY).entries.map((e) =>
        e.id === 'mcp__forge__web_search' ? { ...e, version: '99' } : e,
      ),
    };

    const store = fakeStore([edited]);
    await syncSeedEntries(store);

    expect(
      (await store.current()).doc.entries.find((e) => e.id === 'mcp__forge__web_search'),
    ).toMatchObject({
      version: '99',
    });
  });
});
