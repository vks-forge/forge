/**
 * The history resource of the ForgeApi port: what a ticket or card went through.
 *
 * Why: the History tab on the Ticket and Card pages reads one ordered, plain-language list per
 *   ticket or card, paged by time. The shapes come from `@forge/core`, so the page and the
 *   server cannot disagree about an entry.
 *
 * Exports: HistoryApi, HistoryParams.
 * Depends on: @forge/core (types only), types/api.types.
 */

import type { HistoryPage } from '@forge/core';
import type { RequestOptions } from '#/types/api.types.js';

/** `before` is the previous page's `next_before` cursor; absent for the newest page. */
export interface HistoryParams {
  readonly before?: string | undefined;
  readonly limit?: number | undefined;
}

export interface HistoryApi {
  /** The ticket's entries, oldest first within the page. */
  ticket(
    id: string,
    params?: HistoryParams,
    options?: RequestOptions,
  ): Promise<HistoryPage>;
  /** The card's own phases plus one roll-up line per ticket event. */
  card(
    id: string,
    params?: HistoryParams,
    options?: RequestOptions,
  ): Promise<HistoryPage>;
}
