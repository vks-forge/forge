/**
 * Response schemas of the project-memory endpoints.
 *
 * Why: a proposal becomes a standing constraint on the Director the moment the owner approves
 *   it, so the screen must show exactly what the server holds and notice when the two
 *   disagree. The shapes mirror apps/server `routes/memory.ts`: the list is `{ records }` of
 *   one-line entries, one record is a `MemoryRecordView` (body, links, search aids, import
 *   notes), search, history, related records, import status and export have their own replies,
 *   and an answer returns the record as it now stands (null if it cannot be re-read) with the
 *   history entry that recorded the decision. Everything comes from `@forge/core`, so a field
 *   added there is not dropped here.
 *
 * Exports: MemoryListResponse, MemoryRecordResponse, MemoryAnswerResponse, MemoryHistoryResponse,
 *   MemoryRelatedResponse (schemas and types), MemorySearchReply, MemoryImportStatus,
 *   MemoryExportReply (core re-exports).
 * Depends on: @forge/core (memory schemas), zod.
 */

import {
  MemoryAidVersion,
  MemoryEvent,
  MemoryExportReply,
  MemoryImportStatus,
  MemoryListEntry,
  MemoryRecordView,
  MemoryRecordWithBody,
  MemoryRelated,
  MemorySearchReply,
} from '@forge/core';
import { z } from 'zod';

export { MemoryExportReply, MemoryImportStatus, MemorySearchReply };

export const MemoryListResponse = z.object({ records: z.array(MemoryListEntry) });
export type MemoryListResponse = z.infer<typeof MemoryListResponse>;

export const MemoryRecordResponse = z.object({ record: MemoryRecordView });
export type MemoryRecordResponse = z.infer<typeof MemoryRecordResponse>;

export const MemoryAnswerResponse = z.object({
  record: MemoryRecordWithBody.nullable(),
  commit: z.unknown().optional(),
});
export type MemoryAnswerResponse = z.infer<typeof MemoryAnswerResponse>;

export const MemoryHistoryResponse = z.object({
  events: z.array(MemoryEvent),
  versions: z.array(MemoryAidVersion),
});
export type MemoryHistoryResponse = z.infer<typeof MemoryHistoryResponse>;

export const MemoryRelatedResponse = z.object({ related: z.array(MemoryRelated) });
export type MemoryRelatedResponse = z.infer<typeof MemoryRelatedResponse>;
