/**
 * TanStack Query hooks for the setup cache: how big it is, and clearing it.
 *
 * Why: the settings screen shows the cache size and offers to empty it. After a clear the size
 *   must be re-read at once, otherwise the screen would keep saying the freed gigabytes are
 *   still used. One key means one request and one invalidation.
 *
 * Exports: SETUP_CACHE_KEY, useSetupCache(), useClearSetupCache().
 * Depends on: @tanstack/react-query, api/api-provider.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForgeApi } from '#/api/api-provider.js';

export const SETUP_CACHE_KEY = ['settings', 'setup-cache'] as const;

export function useSetupCache() {
  const api = useForgeApi();

  return useQuery({
    queryKey: SETUP_CACHE_KEY,
    queryFn: ({ signal }) => api.settings.setupCache({ signal }),
  });
}

export function useClearSetupCache() {
  const api = useForgeApi();
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: { include_downloads: boolean }) =>
      api.settings.clearSetupCache(body),
    onSettled: () => client.invalidateQueries({ queryKey: SETUP_CACHE_KEY }),
  });
}
