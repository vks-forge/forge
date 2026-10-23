/**
 * TanStack Query hooks for escalations: a card's list, acting on one, acting on a ticket's wait.
 *
 * Why: one escalation shows in the card chat, on the Ticket page and in the Inbox, so acting in
 *   any of them must settle all three. Every act therefore invalidates the whole family: the
 *   ticket (`["ticket", id]`), the ticket and card lists, the card (`["card", id]` covers its
 *   history and its escalation list) and the Inbox (`["inbox"]`); the project stream does the
 *   same for changes made elsewhere. A simple choice (answer, retry, run as Express, rework) is
 *   optimistic: the item is marked settled in the cached card list and ticket at once (in place, so
 *   the card that sent it stays mounted), and the snapshot is put back if the server refuses. A choice that opens a dialog
 *   (cancel, re-plan) and the re-check (whose answer is the point) wait for the server, so the
 *   dialog can show a refusal such as "other tickets depend on this". Refusals keep the raw
 *   server error so the caller can say why in words (domain/escalation-errors). A successful act
 *   shows the reply's `next` line as a short notice (api/announce-next).
 *
 * Exports: cardEscalationsKey(), useCardEscalations(), useActOnEscalation(),
 *   useActOnTicketWait(), refreshAfterAct().
 * Depends on: @tanstack/react-query, api/announce-next, api/api-error, api/api-provider, api/poll-interval, api/use-card-board,
 *   api/use-card (CARD_POLL_MS), api/use-ticket-pipeline, api/use-tickets, schemas/escalation, schemas/tickets,
 *   types/escalation-ui.types (types).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { announceNext } from '#/api/announce-next.js';
import { ApiError } from '#/api/api-error.js';
import { useForgeApi } from '#/api/api-provider.js';
import { useRefetchMs } from '#/api/poll-interval.js';
import { CARD_POLL_MS } from '#/api/use-card.js';
import { CARDS_KEY, cardKey } from '#/api/use-card-board.js';
import { ticketPipelineKey } from '#/api/use-ticket-pipeline.js';
import { TICKETS_KEY, ticketKey } from '#/api/use-tickets.js';
import type {
  EscalationAction,
  EscalationActBody,
  EscalationList,
  EscalationView,
} from '#/schemas/escalation.js';
import type { TicketDetail } from '#/schemas/tickets.js';
import type { EscalationSnapshot } from '#/types/escalation-ui.types.js';

export const cardEscalationsKey = (cardId: string) =>
  [...cardKey(cardId), 'escalations'] as const;

const INBOX_KEY = ['inbox'] as const;
const SETTINGS_KEY = ['project-settings'] as const;

/** Actions whose result is certain enough to show before the server answers. */
const OPTIMISTIC: ReadonlySet<EscalationActBody['action']> = new Set([
  'answer',
  'retry',
  'run_as_express',
  'rework',
]);

/** A card's escalations, pending first, then the last settled ones. */
export function useCardEscalations(cardId: string) {
  const api = useForgeApi();
  const pollMs = useRefetchMs(CARD_POLL_MS);

  return useQuery({
    queryKey: cardEscalationsKey(cardId),
    queryFn: ({ signal }) => api.escalations.forCard(cardId, { signal }),
    refetchInterval: pollMs,
    refetchOnWindowFocus: true,
  });
}

export function refreshAfterAct(
  client: QueryClient,
  target: { ticketId: string; cardId: string | undefined },
): Promise<unknown> {
  return Promise.all([
    client.invalidateQueries({ queryKey: ticketKey(target.ticketId) }),
    client.invalidateQueries({ queryKey: ticketPipelineKey(target.ticketId) }),
    client.invalidateQueries({ queryKey: TICKETS_KEY }),
    client.invalidateQueries({ queryKey: CARDS_KEY }),
    client.invalidateQueries({ queryKey: INBOX_KEY }),
    // "Always for this project" saves a settings version; the Tool approvals tab must see it.
    client.invalidateQueries({ queryKey: SETTINGS_KEY }),
    ...(target.cardId === undefined
      ? []
      : [client.invalidateQueries({ queryKey: cardKey(target.cardId) })]),
  ]);
}

/** Marks the escalation settled by the owner in the cached card list and ticket. */
function settleInCache(
  client: QueryClient,
  view: EscalationView,
  action: EscalationAction,
): EscalationSnapshot {
  const listKey =
    view.card_id === undefined ? undefined : cardEscalationsKey(view.card_id);

  const list =
    listKey === undefined ? undefined : client.getQueryData<EscalationList>(listKey);

  const ticket = client.getQueryData<TicketDetail>(ticketKey(view.ticket_id));
  const at = new Date().toISOString();

  // Settled in place, never removed: a removed item would unmount the card that is waiting for
  // the server's answer, and with it any refusal the owner has to read.
  const settle = (item: EscalationView): EscalationView =>
    item.id === view.id
      ? { ...item, status: 'answered', settled: { action, by: 'owner', at } }
      : item;

  if (listKey !== undefined && list !== undefined) {
    client.setQueryData<EscalationList>(listKey, { items: list.items.map(settle) });
  }

  if (ticket !== undefined) {
    client.setQueryData<TicketDetail>(ticketKey(view.ticket_id), {
      ...ticket,
      escalations: ticket.escalations.map(settle),
    });
  }

  return { list, ticket };
}

function restore(
  client: QueryClient,
  view: EscalationView,
  snapshot: EscalationSnapshot,
): void {
  if (view.card_id !== undefined && snapshot.list !== undefined) {
    client.setQueryData(cardEscalationsKey(view.card_id), snapshot.list);
  }

  if (snapshot.ticket !== undefined) {
    client.setQueryData(ticketKey(view.ticket_id), snapshot.ticket);
  }
}

/** Acts on one escalation; the refusal is the raw server error. */
export function useActOnEscalation(
  view: EscalationView,
  onKeep?: (view: EscalationView) => void,
) {
  const api = useForgeApi();
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: EscalationActBody) => api.escalations.act(view.id, body),
    onMutate: async (body): Promise<{ snapshot: EscalationSnapshot | undefined }> => {
      if (!OPTIMISTIC.has(body.action)) {
        return { snapshot: undefined };
      }

      await client.cancelQueries({ queryKey: ticketKey(view.ticket_id) });
      if (view.card_id !== undefined) {
        await client.cancelQueries({ queryKey: cardEscalationsKey(view.card_id) });
      }

      return { snapshot: settleInCache(client, view, body.action) };
    },
    // The mutation, not the card, hands a settled item back: the refreshed lists no longer hold it
    // and may unmount the card before the card sees the success.
    onSuccess: (reply) => {
      announceNext(reply.next);
      onKeep?.(reply.escalation);
    },
    onError: (error, _body, context) => {
      if (context?.snapshot !== undefined) {
        restore(client, view, context.snapshot);
      }

      if (error instanceof ApiError && error.code === 'not_pending') {
        onKeep?.(view);
      }
    },
    // Not awaited: TanStack holds a mutation in "pending" until its `onSettled` promise settles, and
    // the refreshed lists no longer hold a settled item, so awaiting would unmount the card before it
    // could say "Merged anyway by you" (the card hands the settled item back through `onKeep`).
    onSettled: () => {
      void refreshAfterAct(client, { ticketId: view.ticket_id, cardId: view.card_id });
    },
  });
}

/** Acts on a ticket's own wait (review, sign-off, scheduler waits): there is no question to settle. */
export function useActOnTicketWait(ticketId: string, cardId: string | undefined) {
  const api = useForgeApi();
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: EscalationActBody) => api.escalations.actOnTicket(ticketId, body),
    onSuccess: (reply) => announceNext(reply.next),
    onSettled: () => refreshAfterAct(client, { ticketId, cardId }),
  });
}
