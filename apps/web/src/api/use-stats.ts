/**
 * `useStats()` and `useCostReport()`: a project's numbers for one range, as TanStack Queries.
 *
 * Why: Home and Cost both draw "the last 7, 30 or 90 days". Keying each query by project and
 *   range means switching the range shows the cached answer for that range at once (no blank
 *   flash) and refetches behind it, while a different project never reuses another's numbers.
 *   `placeholderData` keeps the previous range on screen while the new one loads, so the page
 *   does not jump to a skeleton on every click. The figures are computed on request from rows
 *   Forge already keeps, so a minute-long refresh is enough to keep "active Workers" honest.
 *
 * Exports: useStats(), useCostReport().
 * Depends on: @tanstack/react-query, api/api-provider, @forge/core (types).
 */

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { StatsRange } from '@forge/core';
import { useForgeApi } from '#/api/api-provider.js';

const REFRESH_MS = 60_000;

export function useStats(slug: string, range: StatsRange) {
  const api = useForgeApi();

  return useQuery({
    queryKey: ['stats', slug, range] as const,
    queryFn: ({ signal }) => api.stats.get(slug, range, { signal }),
    placeholderData: keepPreviousData,
    refetchInterval: REFRESH_MS,
  });
}

export function useCostReport(slug: string, range: StatsRange) {
  const api = useForgeApi();

  return useQuery({
    queryKey: ['cost', slug, range] as const,
    queryFn: ({ signal }) => api.cost.get(slug, range, { signal }),
    placeholderData: keepPreviousData,
    refetchInterval: REFRESH_MS,
  });
}
