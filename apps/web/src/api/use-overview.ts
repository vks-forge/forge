/**
 * `useOverview()`: the cross-project Overview figures for one set of filters, as a TanStack Query.
 *
 * Why: the Overview is the screen an owner leaves open while Workers run, so it refetches
 *   every 30 seconds and shows "waiting on you" and "workers running" close to live. Keying
 *   by the filters means a click on 90d shows the cached answer for 90d at once when there is
 *   one, and `placeholderData` keeps the previous figures on screen while the new ones load,
 *   so a filter change never flashes a skeleton. Pausing while the tab is hidden is the
 *   library default, so a forgotten tab costs the server nothing.
 *
 * Exports: useOverview(), OVERVIEW_REFRESH_MS.
 * Depends on: @tanstack/react-query, api/api-provider, types/overview.types.
 */

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useForgeApi } from '#/api/api-provider.js';
import type { OverviewRequest } from '#/types/overview.types.js';

export const OVERVIEW_REFRESH_MS = 30_000;

export function useOverview(request: OverviewRequest) {
  const api = useForgeApi();

  return useQuery({
    queryKey: [
      'overview',
      request.range,
      request.group ?? 'auto',
      [...request.projects].sort().join(','),
      request.archived,
    ] as const,
    queryFn: ({ signal }) => api.overview.get(request, { signal }),
    placeholderData: keepPreviousData,
    refetchInterval: OVERVIEW_REFRESH_MS,
  });
}
