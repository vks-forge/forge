/**
 * Memory record schema — the minimum a markdown record must carry to become a constraint.
 *
 * Why: records are hand-edited files. The Director only needs id, statement and status to
 *   apply a constraint, so only those are enforced (tags are read when well-formed); every other field (source, author,
 *   tags, ...) passes through for the future writer and janitor. A record that fails here
 *   is skipped, never loaded half-understood.
 *
 * Exports: MemoryRecordFrontMatter (schema and type).
 * Depends on: zod.
 */

import { z } from 'zod';

export const MemoryRecordFrontMatter = z.looseObject({
  id: z.string().regex(/^[a-z]-\d{4}$/, 'id must look like d-0001'),
  statement: z.string().trim().min(1, 'statement must not be empty'),
  status: z.string().optional(),
  // Read for an agent's memory filter; a malformed `tags` reads as none instead of skipping the record.
  tags: z.array(z.string()).optional().catch(undefined),
});

export type MemoryRecordFrontMatter = z.infer<typeof MemoryRecordFrontMatter>;
