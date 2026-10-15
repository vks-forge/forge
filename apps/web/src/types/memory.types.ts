/**
 * Shapes for the memory screen: the API port and the filter the list applies.
 *
 * Why: the memory screen reads and answers proposals through one port so the http adapter and
 *   the fixtures behave the same, and the list filter (tab, text, tag, status) is data the
 *   URL and the tests can both name.
 *
 * Exports: MemoryApi, MemoryTab, MemoryFilter, MemoryAnswer.
 * Depends on: @forge/core (types), types/api.types.
 */

import type { MemoryListEntry, MemoryRecordWithBody } from '@forge/core';
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

export interface MemoryApi {
  list(slug: string, options?: RequestOptions): Promise<readonly MemoryListEntry[]>;
  get(slug: string, id: string, options?: RequestOptions): Promise<MemoryRecordWithBody>;
  /** Approve or reject a pending proposal. A 409 `ApiError` means it was already answered. */
  answer(slug: string, answer: MemoryAnswer): Promise<MemoryRecordWithBody | null>;
}
