/**
 * TanStack Query hooks for tickets: the Board's list, one ticket and answering a question.
 *
 * Why: the Board and Ticket page must stay current without the user reloading, cheaply and
 *   without hammering the server. Both queries refetch on a slow interval and when the tab
 *   regains focus (and pause while the tab is hidden), which is plenty because the live
 *   Worker thread has its own stream. The Board loads one list and groups it on the client
 *   rather than asking per column: a ticket has one state, so one newest-first list is a
 *   single consistent snapshot (a ticket moving between columns can never appear twice or
 *   vanish between two requests), one refetch refreshes the whole board and paging stays
 *   one cursor. The first pages load on their own up to a cap; past it the user asks for
 *   more. Answering is optimistic: the question leaves the page at once and comes back, with
 *   the typed answer kept by the form, if the server refuses.
 *
 * Exports: TICKETS_KEY, ticketKey(), useTicketBoard(), useTicketDetail(), useAnswerInteraction(),
 *   BOARD_PAGE_SIZE, BOARD_AUTO_PAGES, POLL_MS.
 * Depends on: @tanstack/react-query, api/api-provider, api/poll-interval, schemas/tickets.
 */

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { TicketSummary } from '@forge/core';
import { useEffect, useMemo } from 'react';
import { useForgeApi } from '#/api/api-provider.js';
import { useRefetchMs } from '#/api/poll-interval.js';
import type { TicketDetail } from '#/schemas/tickets.js';

export const TICKETS_KEY = ['tickets'] as const;
export const ticketKey = (id: string) => ['ticket', id] as const;

export const POLL_MS = 5000;
export const BOARD_PAGE_SIZE = 200;
/** Pages fetched without asking: 5 x 200 tickets. */
export const BOARD_AUTO_PAGES = 5;

/** Every ticket of a project, newest change first, deduplicated across pages. */
export function useTicketBoard(slug: string) {
  const api = useForgeApi();
  // The project stream names `["tickets", slug]`, so the list can poll slowly while it is open.
  const pollMs = useRefetchMs(POLL_MS);
  const query = useInfiniteQuery({
    queryKey: [...TICKETS_KEY, slug],
    queryFn: ({ pageParam, signal }) =>
      api.tickets.list(
        {
          slug,
          limit: BOARD_PAGE_SIZE,
          ...(pageParam === undefined ? {} : { cursor: pageParam }),
        },
        { signal },
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: pollMs,
    refetchOnWindowFocus: true,
  });

  const { hasNextPage, isFetchingNextPage, fetchNextPage, data } = query;
  const loadedPages = data?.pages.length ?? 0;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && loadedPages < BOARD_AUTO_PAGES) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, loadedPages, fetchNextPage]);

  const tickets = useMemo<readonly TicketSummary[]>(() => {
    const seen = new Set<string>();

    return (data?.pages ?? []).flatMap((page) =>
      page.items.filter((item) => {
        if (seen.has(item.id)) {
          return false;
        }

        seen.add(item.id);

        return true;
      }),
    );
  }, [data]);

  return { query, tickets };
}

export function useTicketDetail(id: string) {
  const api = useForgeApi();

  return useQuery({
    queryKey: ticketKey(id),
    queryFn: ({ signal }) => api.tickets.get(id, { signal }),
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  });
}

/** Answers a pending question; the question disappears at once and returns if refused. */
export function useAnswerInteraction(ticketId: string) {
  const api = useForgeApi();
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { interactionId: string; answer: string }) =>
      api.interactions.answer(input.interactionId, input.answer),
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: ticketKey(ticketId) });
      const previous = client.getQueryData<TicketDetail>(ticketKey(ticketId));
      if (previous) {
        client.setQueryData<TicketDetail>(ticketKey(ticketId), {
          ...previous,
          interactions: previous.interactions.filter((i) => i.id !== input.interactionId),
        });
      }

      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        client.setQueryData(ticketKey(ticketId), context.previous);
      }
    },
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ticketKey(ticketId) }),
        client.invalidateQueries({ queryKey: TICKETS_KEY }),
      ]);
    },
  });
}
