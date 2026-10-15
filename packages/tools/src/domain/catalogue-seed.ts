/**
 * The built-in tool catalogue, version 1.
 *
 * Why: a fresh database has no catalogue, and a server that started with none would run
 *   with every tool denied. The database store writes this document as version 1 the first
 *   time it opens, so the factory works on day one; from then on the database is the only
 *   source and the owner changes it through Settings (d-0085). Validating at build time
 *   (the parse here fills defaults and rejects a typo) means a bad edit to the seed fails
 *   the first import, not a run.
 *
 * Exports: BUILT_IN_CATALOGUE, SEED_AUTHOR, SEED_REASON.
 * Depends on: domain/catalogue-seed-native, domain/catalogue-seed-forge, schemas/catalogue.
 *   No IO.
 */

import { FORGE_SEED } from '#/domain/catalogue-seed-forge.js';
import { NATIVE_SEED } from '#/domain/catalogue-seed-native.js';
import { CatalogueDoc } from '#/schemas/catalogue.js';

export const BUILT_IN_CATALOGUE: CatalogueDoc = CatalogueDoc.parse({
  entries: [...NATIVE_SEED, ...FORGE_SEED],
});

export const SEED_AUTHOR = 'forge';
export const SEED_REASON = 'built-in catalogue';
