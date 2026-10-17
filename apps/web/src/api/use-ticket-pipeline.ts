/**
 * TanStack Query hooks for a ticket's own pipeline: the strip and one stage artifact.
 *
 * Why: the ticket page shows where a ticket is in its lane's stages (which passed, which runs,
 *   how many reworks it has used). The engine does not push a "pipeline changed" event, so the
 *   strip stays live two ways: it polls at the ticket's pace, and the page hands it a stamp of the
 *   ticket (status, change time, rework count, run count) that changes whenever the ticket does,
 *   which refetches at once instead of waiting for the next poll. An artifact is fetched only
 *   when the owner opens it, one by one by id, so the strip stays small; its content never
 *   changes once written, so it is cached for good.
 *
 * Exports: ticketPipelineKey(), ticketArtifactKey(), useTicketPipeline(), useStageArtifact().
 * Depends on: @tanstack/react-query, react, api/api-provider, api/poll-interval, api/use-tickets.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useForgeApi } from '#/api/api-provider.js';
import { useRefetchMs } from '#/api/poll-interval.js';
import { POLL_MS } from '#/api/use-tickets.js';

export const ticketPipelineKey = (id: string) => ['ticket-pipeline', id] as const;
export const ticketArtifactKey = (id: string, artifactId: number) =>
  ['ticket-artifact', id, artifactId] as const;

export function useTicketPipeline(id: string, stamp: string) {
  const api = useForgeApi();
  const client = useQueryClient();
  const refetchMs = useRefetchMs(POLL_MS);
  const seen = useRef(stamp);

  // The engine does not publish this key yet: follow the ticket instead.
  useEffect(() => {
    if (seen.current !== stamp) {
      seen.current = stamp;
      void client.invalidateQueries({ queryKey: ticketPipelineKey(id) });
    }
  }, [client, id, stamp]);

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
