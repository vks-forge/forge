/**
 * TanStack Query hook for a project's scorecards: how each agent and each pipeline shape did.
 *
 * Why: the owner decides which agent to trust with what, and whether a lane is worth its stages,
 *   from figures the server computes on read from finished tickets (never stored, never applied).
 *   There is no live key for them, so the query refetches on focus and after the owner marks a
 *   finding (a mark changes the verdict counts); the key is `["scorecards", slug, range]`, with
 *   the agent id appended when only one agent's card is wanted.
 *
 * Exports: scorecardsKey(), useScorecards().
 * Depends on: @tanstack/react-query, api/api-provider.
 */

import { useQuery } from '@tanstack/react-query';
import { useForgeApi } from '#/api/api-provider.js';

export const scorecardsKey = (slug: string, range: '30d' | '90d', agent?: string) =>
  agent === undefined
    ? (['scorecards', slug, range] as const)
    : (['scorecards', slug, range, agent] as const);

export function useScorecards(
  slug: string,
  range: '30d' | '90d',
  options: { agent?: string; enabled?: boolean } = {},
) {
  const api = useForgeApi();

  return useQuery({
    queryKey: scorecardsKey(slug, range, options.agent),
    queryFn: ({ signal }) =>
      api.scorecards.get({ slug, range, agent: options.agent }, { signal }),
    enabled: (options.enabled ?? true) && slug !== '',
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}
