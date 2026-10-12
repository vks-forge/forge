/**
 * Catalogue schema — the signed list of tools a run may ever be offered.
 *
 * Why: the catalogue is the root of trust for tool policy; if a Worker or a compromised
 *   checkout could edit it, every other layer would be moot. It therefore travels with an
 *   HMAC signature over its canonical content, and the loader refuses (quarantines)
 *   anything that does not verify or does not parse, rather than guessing at a partial
 *   catalogue (tool-system.md §4, §13).
 *
 * Exports: CatalogueFile, CATALOGUE_SIGNATURE_PATTERN.
 * Depends on: schemas/tool-definition, zod. No IO.
 */

import { z } from 'zod';
import { ToolDefinition } from '#/schemas/tool-definition.js';

export const CATALOGUE_SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;

/** On-disk shape of `.forge/tools/catalog.yaml`: entries plus HMAC-SHA256 over `{entries}`. */
export const CatalogueFile = z.object({
  entries: z.array(ToolDefinition).min(1),
  signature: z.string().regex(CATALOGUE_SIGNATURE_PATTERN),
});
export type CatalogueFile = z.infer<typeof CatalogueFile>;
