/**
 * Response schemas of the project-memory endpoints.
 *
 * Why: a proposal becomes a standing constraint on the Director the moment the owner approves
 *   it, so the screen must show exactly what the server holds and notice when the two
 *   disagree. The shapes mirror apps/server `routes/memory.ts`: the list is `{ records }` of
 *   one-line entries, one record carries its markdown body, and an answer returns the
 *   record as it now stands (null if it cannot be re-read) with the git commit that recorded
 *   the decision. Records come from `@forge/core`, so a front-matter field added there is
 *   not dropped here.
 *
 * Exports: MemoryListResponse, MemoryRecordResponse, MemoryAnswerResponse (schemas and types).
 * Depends on: @forge/core (MemoryListEntry, MemoryRecordWithBody), zod.
 */

import { MemoryListEntry, MemoryRecordWithBody } from '@forge/core';
import { z } from 'zod';

export const MemoryListResponse = z.object({ records: z.array(MemoryListEntry) });
export type MemoryListResponse = z.infer<typeof MemoryListResponse>;

export const MemoryRecordResponse = z.object({ record: MemoryRecordWithBody });
export type MemoryRecordResponse = z.infer<typeof MemoryRecordResponse>;

export const MemoryAnswerResponse = z.object({
  record: MemoryRecordWithBody.nullable(),
  commit: z.unknown().optional(),
});
export type MemoryAnswerResponse = z.infer<typeof MemoryAnswerResponse>;
