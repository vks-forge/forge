/**
 * `useTileRetry`: Retry a parked ticket from its Board tile.
 *
 * Why: a ticket parked on a retry cap or a crash offers Retry as an owner question (escalation).
 *   The tile reuses that same action so the button does exactly what Retry does on the Ticket
 *   page, the card chat and the Inbox: it settles the question and sends the ticket back to work,
 *   then refreshes every list that shows it. The refusal is kept raw so the tile can say why.
 *
 * Exports: useTileRetry().
 * Depends on: @tanstack/react-query, api/api-provider, api/announce-next, api/use-escalations (refreshAfterAct).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { announceNext } from '#/api/announce-next.js';
import { useForgeApi } from '#/api/api-provider.js';
import { refreshAfterAct } from '#/api/use-escalations.js';

export function useTileRetry(target: {
  escalationId: string;
  ticketId: string;
  cardId: string | undefined;
}) {
  const api = useForgeApi();
  const client = useQueryClient();

  return useMutation({
    mutationFn: () => api.escalations.act(target.escalationId, { action: 'retry' }),
    onSuccess: (reply) => announceNext(reply.next),
    onSettled: () =>
      refreshAfterAct(client, { ticketId: target.ticketId, cardId: target.cardId }),
  });
}
