/**
 * `useTicketHistory()` and `useCardHistory()`: what a ticket or card went through, paged.
 *
 * Why: the History tab shows the whole story, but a long-lived card has hundreds of entries, so
 *   the newest page loads first and "Load earlier" reads older ones through the server's
 *   `next_before` cursor. The query keys sit under the ticket's and card's own keys
 *   (`["ticket", id, "history"]`, `["card", id, "history"]`), so the keys the project stream
 *   already names on every ticket or card change (`["ticket", id]`, `["card", id]`) refresh the
 *   open History tab with no new stream event (d-0132). The poll is only the safety net and
 *   slows to the stream's pace while it is open.
 *
 * Exports: ticketHistoryKey(), cardHistoryKey(), useTicketHistory(), useCardHistory(), HISTORY_POLL_MS.
 * Depends on: @tanstack/react-query, @forge/core (types), api/api-provider, api/poll-interval,
 *   api/use-tickets, api/use-card-board.
 */

import type { HistoryEntry, HistoryPage } from '@forge/core';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { useForgeApi } from '#/api/api-provider.js';
import { useRefetchMs } from '#/api/poll-interval.js';
import { cardKey } from '#/api/use-card-board.js';
import { ticketKey } from '#/api/use-tickets.js';

export const HISTORY_POLL_MS = 10_000;
const PAGE_SIZE = 100;

export const ticketHistoryKey = (id: string) => [...ticketKey(id), 'history'] as const;
export const cardHistoryKey = (id: string) => [...cardKey(id), 'history'] as const;

/** Pages arrive newest page first; the list reads oldest first, so reverse the pages. */
function oldestFirst(data: InfiniteData<HistoryPage> | undefined): HistoryEntry[] {
  return [...(data?.pages ?? [])].reverse().flatMap((page) => page.entries);
}

function useHistory(
  key: readonly unknown[],
  load: (before: string | undefined, signal: AbortSignal) => Promise<HistoryPage>,
) {
  const refetchMs = useRefetchMs(HISTORY_POLL_MS);

  return useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam, signal }) => load(pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.has_more ? last.next_before : undefined),
    refetchInterval: refetchMs,
    select: oldestFirst,
  });
}

export function useTicketHistory(id: string) {
  const api = useForgeApi();

  return useHistory(ticketHistoryKey(id), (before, signal) =>
    api.history.ticket(id, { before, limit: PAGE_SIZE }, { signal }),
  );
}

export function useCardHistory(id: string) {
  const api = useForgeApi();

  return useHistory(cardHistoryKey(id), (before, signal) =>
    api.history.card(id, { before, limit: PAGE_SIZE }, { signal }),
  );
}
