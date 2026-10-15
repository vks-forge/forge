/**
 * `useSteerRun()`: sends a person's message to a running Worker.
 *
 * Why: the Ticket page lets the owner talk to a Worker mid-run (d-0109). The server stores the
 *   message and writes a `user_message` event, so the open thread shows it on its own; this
 *   hook only has to send it and report the outcome. Nothing is cached about the send: the run
 *   events are the record, and a refused message must leave no trace in the thread.
 *
 * Exports: useSteerRun().
 * Depends on: @tanstack/react-query, api/api-provider.
 */

import { useMutation } from '@tanstack/react-query';
import { useForgeApi } from '#/api/api-provider.js';

export function useSteerRun(runId: string) {
  const api = useForgeApi();

  return useMutation({
    mutationFn: (input: { message: string; author: string }) =>
      api.runs.steer(runId, input.message, input.author),
  });
}
