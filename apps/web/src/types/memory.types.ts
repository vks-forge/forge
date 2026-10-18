/**
 * Shapes for the memory screen: the API port and the filter the list applies.
 *
 * Why: the memory screen reads, searches and answers proposals through one port, the record
 *   page adds history, related records, import status and export, and the list filter (tab,
 *   text, tag, status) and the search state are data the URL and the tests can both name.
 *   Nothing on the port writes a record's statement or source: records are append-only, and a
 *   change is a new record that supersedes the old one.
 *
 * Exports: MemoryApi, MemoryTab, MemoryFilter, MemoryAnswer, MemorySearchState,
 *   MemorySearchParams, MemoryHistory.
 * Depends on: @forge/core (types), types/api.types.
 */

import type {
  MemoryAidVersion,
  MemoryEvent,
  MemoryExportReply,
  MemoryImportStatus,
  MemoryKind,
  MemoryListEntry,
  MemoryRecordView,
  MemoryRecordWithBody,
  MemoryRelated,
  MemorySearchReply,
  MemoryStatus,
} from '@forge/core';
import type { RequestOptions } from '#/types/api.types.js';

export type MemoryTab = 'decisions' | 'rejected' | 'proposals' | 'outcomes';

export interface MemoryFilter {
  readonly tab: MemoryTab;
  readonly text: string;
  readonly tags: readonly string[];
  /** Decisions only: hide superseded ones. */
  readonly activeOnly: boolean;
}

/** What the owner decided about a proposal. */
export type MemoryAnswer =
  | { readonly id: string; readonly verdict: 'approve' }
  | { readonly id: string; readonly verdict: 'reject'; readonly reason: string };

/** What the search box and its chips say; held in the URL (`?q=&kind=&status=&tag=&superseded=1`). */
export interface MemorySearchState {
  readonly q: string;
  readonly kinds: readonly MemoryKind[];
  readonly statuses: readonly MemoryStatus[];
  readonly tags: readonly string[];
  /** Also return decisions that were replaced. */
  readonly superseded: boolean;
}

/** One request to `GET /memory/search`: the state plus where to start. */
export interface MemorySearchParams extends MemorySearchState {
  readonly offset: number;
  readonly limit: number;
}

/** A record's state moves and its search-aid versions, oldest first. */
export interface MemoryHistory {
  readonly events: readonly MemoryEvent[];
  readonly versions: readonly MemoryAidVersion[];
}

export interface MemoryApi {
  list(slug: string, options?: RequestOptions): Promise<readonly MemoryListEntry[]>;
  get(slug: string, id: string, options?: RequestOptions): Promise<MemoryRecordView>;
  /** Owner search; a 409 `memory_not_migrated` `ApiError` means the project is still on files. */
  search(
    slug: string,
    params: MemorySearchParams,
    options?: RequestOptions,
  ): Promise<MemorySearchReply>;
  history(slug: string, id: string, options?: RequestOptions): Promise<MemoryHistory>;
  related(
    slug: string,
    id: string,
    options?: RequestOptions,
  ): Promise<readonly MemoryRelated[]>;
  importStatus(slug: string, options?: RequestOptions): Promise<MemoryImportStatus>;
  /** Re-run backup, import, verify and delete; 409 `memory_import_running` while one runs. */
  retryImport(slug: string): Promise<MemoryImportStatus>;
  /** Write the project's memory as markdown files; 409 `memory_not_migrated` for a file project. */
  exportMarkdown(slug: string): Promise<MemoryExportReply>;
  /** Approve or reject a pending proposal. A 409 `ApiError` means it was already answered. */
  answer(slug: string, answer: MemoryAnswer): Promise<MemoryRecordWithBody | null>;
}
