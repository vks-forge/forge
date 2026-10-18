/**
 * TanStack Query hooks for a ticket's own pipeline: the strip and one stage artifact.
 *
 * Why: the ticket page shows where a ticket is in its lane's stages (which passed, which runs,
 *   how many reworks it has used, who signed). The server names `["ticket-pipeline", id]` on the
 *   project change stream whenever a stage row, an artifact or the pipeline snapshot is written, and
 *   the project scope invalidates exactly that key (api/use-project-events), so the strip
 *   refetches the moment a stage moves. The poll stays as the safety net and slows to the
 *   stream's pace while it is open. An artifact is fetched only when the owner opens it, one by
 *   one by id, so the strip stays small; its content never changes once written, so it is cached
 *   for good.
 *
 * Exports: ticketPipelineKey(), ticketArtifactKey(), useTicketPipeline(), useStageArtifact().
 * Depends on: @tanstack/react-query, api/api-provider, api/poll-interval, api/use-tickets.
 */

import { useQuery } from '@tanstack/react-query';
import { useForgeApi } from '#/api/api-provider.js';
import { useRefetchMs } from '#/api/poll-interval.js';
import { POLL_MS } from '#/api/use-tickets.js';

export const ticketPipelineKey = (id: string) => ['ticket-pipeline', id] as const;
export const ticketArtifactKey = (id: string, artifactId: number) =>
  ['ticket-artifact', id, artifactId] as const;

export function useTicketPipeline(id: string) {
  const api = useForgeApi();
  const refetchMs = useRefetchMs(POLL_MS);

  return useQuery({
    queryKey: ticketPipelineKey(id),
    queryFn: ({ signal }) => api.pipelines.ticket(id, { signal }),
    refetchInterval: refetchMs,
  });
}

export function useStageArtifact(ticketId: string, artifactId: number, enabled: boolean) {
  const api = useForgeApi();

  return useQuery({
    queryKey: ticketArtifactKey(ticketId, artifactId),
    queryFn: ({ signal }) => api.pipelines.artifact(ticketId, artifactId, { signal }),
    enabled,
    staleTime: Infinity,
  });
}
