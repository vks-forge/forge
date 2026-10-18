/**
 * `useMarkFinding()`: the owner's "Real" or "False alarm" on one finding, shown at once and
 * put back if the server refuses.
 *
 * Why: marks are the owner's verdict on whether a check was right, and the scorecards weigh them
 *   above any guess. A mark is a tiny, certain act, so the toggle changes on the click instead of
 *   after a round trip; the server answers with the strip as it reads now, which replaces the
 *   cache, and a refusal (the row is gone, the server is down) restores what was there and
 *   leaves the error for the toggle to say. Scorecards refetch after a mark since their verdict
 *   counts change.
 *
 * Exports: useMarkFinding().
 * Depends on: @tanstack/react-query, api/api-provider, api/use-ticket-pipeline, domain/finding-marks,
 *   schemas/pipeline-proposals (types).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TicketPipelineView } from '@forge/core';
import { useForgeApi } from '#/api/api-provider.js';
import { ticketPipelineKey } from '#/api/use-ticket-pipeline.js';
import { withMark } from '#/domain/finding-marks.js';
import type { FindingVerdict } from '#/schemas/pipeline-proposals.js';

export function useMarkFinding(ticketId: string) {
  const api = useForgeApi();
  const client = useQueryClient();
  const key = ticketPipelineKey(ticketId);

  return useMutation({
    mutationFn: (args: {
      rowId: number;
      index: number;
      verdict: FindingVerdict | null;
    }) => api.pipelines.markFinding(ticketId, args.rowId, args.index, args.verdict),
    async onMutate(args) {
      await client.cancelQueries({ queryKey: key });
      const before = client.getQueryData<TicketPipelineView | null>(key);

      if (before) {
        client.setQueryData(key, withMark(before, args.rowId, args.index, args.verdict));
      }

      return { before };
    },
    onError(_error, _args, context) {
      if (context?.before !== undefined) {
        client.setQueryData(key, context.before);
      }
    },
    onSuccess: (pipeline) => client.setQueryData(key, pipeline),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: key });
      void client.invalidateQueries({ queryKey: ['scorecards'] });
    },
  });
}
