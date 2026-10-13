/**
 * Catalogue file reader — loads and verifies a catalogue from disk.
 *
 * Why: the catalogue must be read from a trusted place (the main checkout's HEAD), never
 *   from a file inside the Worker's cwd, which the Worker could have edited. This adapter
 *   is the only file-system touchpoint of the package: the caller names the trusted path,
 *   and everything it reads goes through the same signature check as in-memory text, so
 *   an unreadable or tampered file leaves the catalogue quarantined, not partially
 *   loaded (tool-system.md §16, d-0038).
 *
 * Exports: readCatalogueFile().
 * Depends on: node:fs/promises, domain/catalogue, types/catalogue. No other IO.
 */

import { readFile } from 'node:fs/promises';
import { loadCatalogue } from '#/domain/catalogue.js';
import type { CatalogueState, LoadOptions } from '#/types/catalogue.types.js';

/** Reads `path` and verifies it with `key`; a missing or unreadable file is `quarantined`. */
export async function readCatalogueFile(
  path: string,
  key: string | Uint8Array,
  opts: LoadOptions = {},
): Promise<CatalogueState> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    return { status: 'quarantined', reason: 'malformed' };
  }

  return loadCatalogue(text, key, opts);
}
