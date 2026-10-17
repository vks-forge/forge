/**
 * `useCostReport()`: a project's cost figures for one range, as a TanStack Query.
 *
 * Why: Cost draws "the last 7, 30 or 90 days". Keying the query by project and
 *   range means switching the range shows the cached answer for that range at once (no blank
 *   flash) and refetches behind it, while a different project never reuses another's numbers.
 *   `placeholderData` keeps the previous range on screen while the new one loads, so the page
 *   does not jump to a skeleton on every click. The figures are computed on request from rows
 *   Forge already keeps, so a minute-long refresh is enough to keep "active Workers" honest.
 *
 * Exports: useCostReport().
 * Depends on: @tanstack/react-query, api/api-provider, @forge/core (types).
 */

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { StatsRange } from '@forge/core';
import { useForgeApi } from '#/api/api-provider.js';
import type { CostPaging } from '#/types/work-api.types.js';

const REFRESH_MS = 60_000;

export function useCostReport(slug: string, range: StatsRange, page?: CostPaging) {
  const api = useForgeApi();

  return useQuery({
    queryKey: ['cost', slug, range, page] as const,
    queryFn: ({ signal }) => api.cost.get(slug, range, { signal }, page),
    placeholderData: keepPreviousData,
    refetchInterval: REFRESH_MS,
  });
}
