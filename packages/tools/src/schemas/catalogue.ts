/**
 * Catalogue schema — the list of tools a run may ever be offered, as one stored document.
 *
 * Why: the catalogue is the root of tool policy, and it lives in the database outside every
 *   worktree (d-0085), so no Worker or stray edit in a checkout can reach it. It is edited
 *   only through Settings, which saves each change as a new numbered version. This is the
 *   shape of that document and of one saved version; the loader refuses anything that does
 *   not parse rather than guessing at a partial catalogue (tool-system.md §4, §13).
 *
 * Exports: CatalogueDoc, CatalogueVersion.
 * Depends on: schemas/tool-definition, zod. No IO.
 */

import { z } from 'zod';
import { ToolDefinition } from '#/schemas/tool-definition.js';

/** The catalogue document: every tool definition, at least one. */
export const CatalogueDoc = z.object({
  entries: z.array(ToolDefinition).min(1),
});
export type CatalogueDoc = z.infer<typeof CatalogueDoc>;

/** One immutable saved version of the catalogue. `created_at` is epoch milliseconds. */
export const CatalogueVersion = z.object({
  version: z.number().int().min(1),
  doc: CatalogueDoc,
  author: z.string().min(1),
  reason: z.string().min(1),
  created_at: z.number().int().nonnegative(),
});
export type CatalogueVersion = z.infer<typeof CatalogueVersion>;
