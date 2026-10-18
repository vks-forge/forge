/**
 * TanStack Query hooks for the Director's pipeline proposals: the list, Accept and Reject.
 *
 * Why: the Director suggests a change to a project's lane once it made the same change on
 *   several tickets. The owner decides in two places, the Inbox row and the Pipelines tab banner,
 *   and both must show the same pending list and the same result at once. The server announces
 *   `["pipeline-proposals", slug]` and `["inbox", slug]` when a proposal is inserted or decided
 *   (api/use-project-events), so the list refetches itself. A decision also changes the lanes and
 *   the project's settings version, so a settled write refreshes those too; an accept replaces the
 *   lane cache with the lists the server returned so the banner and the editor agree immediately.
 *
 * Exports: proposalsKey(), usePendingProposals(), useAcceptProposal(), useRejectProposal().
 * Depends on: @tanstack/react-query, api/api-provider, api/use-pipelines, api/use-project-settings,
 *   types/proposals-api.types.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { useForgeApi } from '#/api/api-provider.js';
import { pipelinesKey } from '#/api/use-pipelines.js';
import { settingsKey } from '#/api/use-project-settings.js';
import type { ProposalFilter } from '#/types/proposals-api.types.js';

export const proposalsKey = (slug: string, status: ProposalFilter = 'pending') =>
  ['pipeline-proposals', slug, status] as const;

/** The project's pending proposals, newest first; `enabled` false skips the call. */
export function usePendingProposals(slug: string, enabled = true) {
  const api = useForgeApi();

  return useQuery({
    queryKey: proposalsKey(slug),
    queryFn: ({ signal }) => api.proposals.list(slug, 'pending', { signal }),
    enabled: enabled && slug !== '',
  });
}

function refresh(client: QueryClient, slug: string): Promise<unknown> {
  return Promise.all([
    client.invalidateQueries({ queryKey: ['pipeline-proposals', slug] }),
    client.invalidateQueries({ queryKey: ['inbox', slug] }),
    client.invalidateQueries({ queryKey: pipelinesKey({ kind: 'project', slug }) }),
    client.invalidateQueries({ queryKey: settingsKey(slug) }),
  ]);
}

/** `onDone` runs when the server accepted the decision, even if the card that asked has since left the screen. */
export function useAcceptProposal(slug: string, onDone?: () => void) {
  const api = useForgeApi();
  const client = useQueryClient();

  return useMutation({
    mutationFn: (args: { id: number; expected_version: number; reason?: string }) =>
      api.proposals.accept(slug, args.id, {
        expected_version: args.expected_version,
        reason: args.reason,
      }),
    onSuccess: () => onDone?.(),
    onSettled: () => refresh(client, slug),
  });
}

export function useRejectProposal(slug: string, onDone?: () => void) {
  const api = useForgeApi();
  const client = useQueryClient();

  return useMutation({
    mutationFn: (args: { id: number; reason: string }) =>
      api.proposals.reject(slug, args.id, { reason: args.reason }),
    onSuccess: () => onDone?.(),
    onSettled: () => refresh(client, slug),
  });
}
