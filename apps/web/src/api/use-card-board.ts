/**
 * TanStack Query hooks for the Board's Cards view: the card list and the type registry.
 *
 * Why: the Cards view must stay current without the user reloading, cheaply. Like the Tickets
 *   view it loads one newest-change-first list and groups it on the client by the `column` the
 *   server rolled up (d-0107): a card has one column, so one list is a single consistent
 *   snapshot and one cursor pages it; per-column requests would drift apart as cards move.
 *   It refetches every 5 seconds and when the tab regains focus (and pauses while hidden), and
 *   pages in up to a cap before asking the user for more. The card-type registry (label and
 *   icon per type) changes only when settings do, so it is read once and kept for a while.
 *
 * Exports: CARDS_KEY, cardKey(), cardEventsKey(), useCardBoard(), useCardTypes(),
 *   CARD_PAGE_SIZE, CARD_AUTO_PAGES.
 * Depends on: @tanstack/react-query, api/api-provider, api/use-tickets (POLL_MS), @forge/core (types).
 */

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { CardSummary, CardType } from '@forge/core';
import { useEffect, useMemo } from 'react';
import { useForgeApi } from '#/api/api-provider.js';
import { POLL_MS } from '#/api/use-tickets.js';

export const CARDS_KEY = ['cards'] as const;
export const cardKey = (id: string) => ['card', id] as const;
export const cardEventsKey = (id: string) => ['card', id, 'events'] as const;

export const CARD_PAGE_SIZE = 200;
/** Pages fetched without asking: 5 x 200 cards. */
export const CARD_AUTO_PAGES = 5;

/** Every card of a project, newest change first, deduplicated across pages. */
export function useCardBoard(slug: string) {
  const api = useForgeApi();
  const query = useInfiniteQuery({
    queryKey: [...CARDS_KEY, slug],
    queryFn: ({ pageParam, signal }) =>
      api.cards.list(
        {
          slug,
          limit: CARD_PAGE_SIZE,
          ...(pageParam === undefined ? {} : { cursor: pageParam }),
        },
        { signal },
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  });

  const { hasNextPage, isFetchingNextPage, fetchNextPage, data } = query;
  const loadedPages = data?.pages.length ?? 0;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && loadedPages < CARD_AUTO_PAGES) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, loadedPages, fetchNextPage]);

  const cards = useMemo<readonly CardSummary[]>(() => {
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

  return { query, cards };
}

/** The card-type registry in display order; stale only after a few minutes. */
export function useCardTypes() {
  const api = useForgeApi();

  return useQuery<readonly CardType[]>({
    queryKey: ['card-types'],
    queryFn: ({ signal }) => api.cards.types({ signal }),
    staleTime: 5 * 60_000,
  });
}
