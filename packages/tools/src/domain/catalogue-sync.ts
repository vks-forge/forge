/**
 * Adds built-in tools that an existing install's saved catalogue has never held.
 *
 * Why: the built-in catalogue is written once, as version 1, the first time a database opens, and from then on
 *   the saved document is the only source (d-0085). A release that adds tools (the three memory tools) would
 *   leave every existing install with them uncatalogued, and an uncatalogued tool is denied for every Worker.
 *   This appends exactly the built-in tools that no saved version has ever contained, as one new version with
 *   its author and reason; it never brings back a tool the owner removed (an older version held it), never
 *   overwrites an owner's edit, and does nothing when nothing is missing. A save that loses a race with another
 *   editor is retried once against the latest version.
 *
 * Exports: syncSeedEntries().
 * Depends on: domain/catalogue-seed, types/ports/catalogue-store. IO: the catalogue store only.
 */

import { BUILT_IN_CATALOGUE, SEED_AUTHOR } from '#/domain/catalogue-seed.js';
import type { CatalogueStore } from '#/types/ports/catalogue-store.types.js';

/** Appends the missing built-in tools and returns their ids (empty when none were missing). */
export async function syncSeedEntries(store: CatalogueStore): Promise<string[]> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = await store.current();
    const everHeld = new Set(
      (await store.history()).flatMap((v) => v.doc.entries.map((e) => e.id)),
    );

    const missing = BUILT_IN_CATALOGUE.entries.filter((e) => !everHeld.has(e.id));
    if (missing.length === 0) {
      return [];
    }

    try {
      await store.append({
        doc: { entries: [...current.doc.entries, ...missing] },
        author: SEED_AUTHOR,
        reason: `built-in tools added: ${missing.map((e) => e.id.replace('mcp__forge__', '')).join(', ')}`,
        expectedVersion: current.version,
      });

      return missing.map((e) => e.id);
    } catch (error) {
      if (attempt === 1) {
        throw error;
      }
    }
  }

  return [];
}
