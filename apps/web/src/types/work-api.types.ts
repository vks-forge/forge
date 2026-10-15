/**
 * The work resources of the ForgeApi port: stats, inbox, runs, cost and the ticket list.
 *
 * Why: Home, Inbox, Runs and Cost read what the Director and Workers did. Their endpoints
 *   exist on the real server (W5b), so these resources have no fixture twin: a screen
 *   that showed invented runs or spend would be believed (d-0123). Response and query types
 *   come from `@forge/core`, so the UI and server cannot disagree about a field.
 *
 * Exports: QueryParams, StatsApi, CostApi, InboxApi, RunsApi, InboxMarkName, InboxListArgs,
 *   RunListArgs.
 * Depends on: @forge/core (types only), types/api.types.
 */

import type {
  CostReport,
  InboxCounts,
  InboxItem,
  InboxPage,
  InboxView,
  ProjectStats,
  RunDetail,
  RunListPage,
  RunStatus,
  StatsRange,
} from '@forge/core';
import type { RequestOptions } from '#/types/api.types.js';

/** Values of a URL query; an array repeats the key. */
export type QueryParams = Record<string, string | number | readonly string[] | undefined>;

export type InboxMarkName = 'read' | 'unread' | 'archive' | 'unarchive';

export interface InboxListArgs {
  readonly view: InboxView;
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
}

export interface RunListArgs {
  readonly status?: readonly RunStatus[] | undefined;
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
}

export interface StatsApi {
  get(slug: string, range: StatsRange, options?: RequestOptions): Promise<ProjectStats>;
}

export interface CostApi {
  get(slug: string, range: StatsRange, options?: RequestOptions): Promise<CostReport>;
}

export interface InboxApi {
  list(slug: string, args: InboxListArgs, options?: RequestOptions): Promise<InboxPage>;
  counts(slug: string, options?: RequestOptions): Promise<InboxCounts>;
  /** Returns the item as the server now holds it. */
  mark(slug: string, itemId: string, mark: InboxMarkName): Promise<InboxItem>;
}

export interface RunsApi {
  list(slug: string, args: RunListArgs, options?: RequestOptions): Promise<RunListPage>;
  get(id: string, options?: RequestOptions): Promise<RunDetail>;
}
