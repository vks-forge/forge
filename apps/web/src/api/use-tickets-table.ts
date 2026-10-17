/**
 * `useTicketsTable()`: one page of the Tickets list for the current filters, sort and page.
 *
 * Why: the table pages on the server, so each page is its own request. The previous page
 *   stays on screen while the next loads (no flash of skeletons on every click), and the key
 *   starts with `["tickets", slug]` so the project's live stream refreshes the list when a
 *   ticket changes, like the Board.
 *
 * Exports: useTicketsTable().
 * Depends on: @tanstack/react-query, api/api-provider, api/poll-interval, api/use-tickets.
 */

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useForgeApi } from '#/api/api-provider.js';
import { useRefetchMs } from '#/api/poll-interval.js';
import { POLL_MS, TICKETS_KEY } from '#/api/use-tickets.js';
import type { TicketsTableParams } from '#/schemas/tickets-table.js';

export function useTicketsTable(slug: string, params: TicketsTableParams) {
  const api = useForgeApi();
  const pollMs = useRefetchMs(POLL_MS);

  return useQuery({
    queryKey: [...TICKETS_KEY, slug, 'table', params] as const,
    queryFn: ({ signal }) => api.ticketsTable.list(slug, params, { signal }),
    placeholderData: keepPreviousData,
    refetchInterval: pollMs,
    refetchOnWindowFocus: true,
  });
}
