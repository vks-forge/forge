/**
 * CatalogueStore port: the versioned tool catalogue the server and the MCP server read.
 *
 * Why: the catalogue decides which tools exist for a run, so it must live where a Worker
 *   cannot write (the database outside every worktree, d-0085) and every change must be a
 *   new numbered version with an author and a reason, so a run can name the catalogue it
 *   ran under and a bad edit can be reverted by saving the old document again. A save names
 *   the version the editor saw; if another save landed first it fails instead of
 *   overwriting (the same compare-and-swap as Settings). The first open of an empty store
 *   writes the built-in catalogue as version 1, so `current` always answers.
 *
 * Exports: CatalogueStore, CatalogueAppend.
 * Depends on: schemas/catalogue. Types only.
 */

import type { CatalogueDoc, CatalogueVersion } from '#/schemas/catalogue.js';

/** A save request; `expectedVersion` is the version the editor was looking at. */
export interface CatalogueAppend {
  readonly doc: CatalogueDoc;
  readonly author: string;
  readonly reason: string;
  readonly expectedVersion: number;
}

export interface CatalogueStore {
  /** The latest saved version. */
  current(): Promise<CatalogueVersion>;
  /** Every saved version, oldest first. */
  history(): Promise<CatalogueVersion[]>;
  /** Saves a new version; throws `ConfigVersionConflictError` when `expectedVersion` is stale. */
  append(input: CatalogueAppend): Promise<CatalogueVersion>;
}
