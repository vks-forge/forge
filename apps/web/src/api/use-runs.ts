/**
 * `useRunList()` and `useRunDetail()`: Worker runs, kept lively while any is working.
 *
 * Why: the Runs screen is how the owner notices a stuck or expensive Worker, so it must not
 *   go stale while Workers are working. While any listed run is live (starting, running,
 *   settling) the list refetches every few seconds; once everything has finished it stops, so
 *   an idle tab costs nothing. An open run detail does the same for its one run. Paging uses
 *   the server's cursor, so a long history is read 50 runs at a time.
 *
 * Exports: useRunList(), useRunDetail(), RUNS_LIVE_MS.
 * Depends on: @tanstack/react-query, api/api-provider, domain/run-format.
 */

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useForgeApi } from '#/api/api-provider.js';
import { isLive, RUN_FILTERS } from '#/domain/run-format.js';
import type { RunFilterKey } from '#/types/work-ui.types.js';

export const RUNS_LIVE_MS = 5_000;
const PAGE_SIZE = 50;

export function useRunList(slug: string, filter: RunFilterKey) {
  const api = useForgeApi();
  const statuses = RUN_FILTERS.find((f) => f.key === filter)?.statuses;

  return useInfiniteQuery({
    queryKey: ['runs', slug, 'list', filter] as const,
    queryFn: ({ pageParam, signal }) =>
      api.runs.list(
        slug,
        { status: statuses, cursor: pageParam, limit: PAGE_SIZE },
        { signal },
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) => page.items.some(isLive))
        ? RUNS_LIVE_MS
        : false,
  });
}

/** One run with its gates and per-model tokens; idle while `id` is null (drawer closed). */
export function useRunDetail(id: string | null) {
  const api = useForgeApi();

  return useQuery({
    queryKey: ['runs', 'detail', id ?? ''] as const,
    queryFn: ({ signal }) => api.runs.get(id ?? '', { signal }),
    enabled: id !== null,
    refetchInterval: (query) =>
      query.state.data && isLive(query.state.data) ? RUNS_LIVE_MS : false,
  });
}
