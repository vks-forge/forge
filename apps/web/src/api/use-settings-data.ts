/**
 * TanStack Query hooks for the Forge settings screens.
 *
 * Why: the screens share data (the harness list feeds both the list and a harness's detail
 *   page; company settings feed Limits and General) and must refresh it after a write. One
 *   key per resource means one request, one cache and one `invalidate` after a save. The
 *   compatibility check runs for about a minute on the server, so its query polls while the
 *   job is running and stops when it ends: the user sees progress without pressing reload.
 *
 * Exports: HARNESSES_KEY, GITHUB_KEY, COMPANY_KEY, COMPANY_HISTORY_KEY, COMPAT_POLL_MS,
 *   compatKey(), toolsKey(), useHarnesses(), useCompat(), useTools(), useGithubConnections(),
 *   useCompanySettings(), useCompanyHistory().
 * Depends on: @tanstack/react-query, api/api-provider.
 */

import { useQuery } from '@tanstack/react-query';
import { useForgeApi } from '#/api/api-provider.js';

export const HARNESSES_KEY = ['harnesses'] as const;
export const GITHUB_KEY = ['github', 'connections'] as const;
export const COMPANY_KEY = ['settings', 'company'] as const;
export const COMPANY_HISTORY_KEY = ['settings', 'company', 'history'] as const;

/** How often a running compatibility check is re-read. */
export const COMPAT_POLL_MS = 1000;

export const compatKey = (id: string) => ['harnesses', id, 'compat'] as const;
export const toolsKey = (id: string) => ['harnesses', id, 'tools'] as const;

export function useHarnesses() {
  const api = useForgeApi();

  return useQuery({
    queryKey: HARNESSES_KEY,
    queryFn: ({ signal }) => api.harnesses.list({ signal }),
  });
}

export function useCompat(id: string, enabled: boolean) {
  const api = useForgeApi();

  return useQuery({
    queryKey: compatKey(id),
    queryFn: ({ signal }) => api.harnesses.compat(id, { signal }),
    enabled,
    refetchInterval: (query) =>
      query.state.data?.job.state === 'running' ? COMPAT_POLL_MS : false,
  });
}

export function useTools(id: string, enabled: boolean) {
  const api = useForgeApi();

  return useQuery({
    queryKey: toolsKey(id),
    queryFn: ({ signal }) => api.harnesses.tools(id, { signal }),
    enabled,
  });
}

export function useGithubConnections() {
  const api = useForgeApi();

  return useQuery({
    queryKey: GITHUB_KEY,
    queryFn: ({ signal }) => api.github.list({ signal }),
  });
}

export function useCompanySettings() {
  const api = useForgeApi();

  return useQuery({
    queryKey: COMPANY_KEY,
    queryFn: ({ signal }) => api.settings.company({ signal }),
  });
}

export function useCompanyHistory() {
  const api = useForgeApi();

  return useQuery({
    queryKey: COMPANY_HISTORY_KEY,
    queryFn: ({ signal }) => api.settings.companyHistory({ signal }),
  });
}
