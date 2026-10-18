/**
 * The work resources of the ForgeApi port: inbox, runs, cost and the ticket list.
 *
 * Why: Home, Inbox, Runs and Cost read what the Director and Workers did. Their endpoints
 *   exist on the real server (W5b), so these resources have no fixture twin: a screen
 *   that showed invented runs or spend would be believed (d-0123). Response and query types
 *   come from `@forge/core`, so the UI and server cannot disagree about a field.
 *
 * Exports: QueryParams, OverviewApi, CostApi, CostPaging, InboxApi, RunsApi, InboxMarkName, InboxListArgs,
 *   RunListArgs.
 * Depends on: @forge/core (types only), types/api.types.
 */

import type {
  CostReport,
  InboxCounts,
  InboxItem,
  InboxPage,
  InboxView,
  OverviewStats,
  RunDetail,
  RunListPage,
  RunSourcesReply,
  RunStatus,
  StatsRange,
} from '@forge/core';
import type { SteerReply } from '#/schemas/tickets.js';
import type { RequestOptions } from '#/types/api.types.js';
import type { OverviewRequest } from '#/types/overview.types.js';

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

export interface OverviewApi {
  get(request: OverviewRequest, options?: RequestOptions): Promise<OverviewStats>;
}

/** Which rows of the ranked ticket and run tables to fetch; the two page independently. */
export interface CostPaging {
  readonly ticket: { readonly limit: number; readonly offset: number };
  readonly run: { readonly limit: number; readonly offset: number };
}

export interface CostApi {
  /** Without `page` the server returns its default first page of each ranked table. */
  get(
    slug: string,
    range: StatsRange,
    options?: RequestOptions,
    page?: CostPaging,
  ): Promise<CostReport>;
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
  /** The pages this run's Worker read (no text), oldest first. */
  sources(id: string, options?: RequestOptions): Promise<RunSourcesReply>;
  /** Messages a running Worker; refused with 409 when the run is over or cannot take it. */
  steer(id: string, message: string, author: string): Promise<SteerReply>;
}
