/**
 * TanStack Query hook for what a far-reaching escalation action would change.
 *
 * Why: Re-plan, Cancel ticket and Merge anyway are confirmed in a popup that lists the real effect
 *   (held tickets, what is deleted, which check is overruled). The list is read when the popup
 *   opens, never cached across openings, so a screen left open for an hour cannot confirm on an
 *   old picture. It sits under the ticket's own key, so any act on the ticket refreshes it. A
 *   failed read is not retried: the popup then says so and still lets the owner act, with the
 *   generic words, because a broken preview must not take the way forward away.
 *
 * Exports: useActionConsequences().
 * Depends on: @tanstack/react-query, api/api-provider, api/use-tickets, schemas/escalation.
 */

import { useQuery } from '@tanstack/react-query';
import { useForgeApi } from '#/api/api-provider.js';
import { ticketKey } from '#/api/use-tickets.js';
import type { ConsequenceAction } from '#/schemas/escalation.js';

/** The consequences of `action` on the ticket, fetched only while `open`. */
export function useActionConsequences(
  ticketId: string,
  action: ConsequenceAction,
  open: boolean,
) {
  const api = useForgeApi();

  return useQuery({
    queryKey: [...ticketKey(ticketId), 'consequences', action] as const,
    queryFn: ({ signal }) => api.escalations.consequences(ticketId, action, { signal }),
    enabled: open,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
}
