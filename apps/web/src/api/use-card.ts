/**
 * TanStack Query hooks for one card: its detail, its history, sending a chat message and
 * patching it (type change, close).
 *
 * Why: the Card page is a conversation with the card's Director, so it must show a reply soon
 *   after it exists without hammering the server. The detail and the history refetch slowly
 *   (5 s) and every 3 s while a reply is awaited (the Director is thinking, or the user just
 *   sent a message and no Director message follows it), and pause while the tab is hidden. The
 *   history is read oldest-first and the API only pages forward, so the hook follows the
 *   cursors to the end (up to a cap) and hands back one flat list; the chat shows its newest
 *   tail. A send is optimistic in the view: it appends an unsent line, and on success the
 *   server's own event replaces it in the cache, on refusal the line is removed and the draft
 *   is untouched. Patching writes the returned card into the cache so the header changes at once.
 *
 * Exports: useCardDetail(), useCardEvents(), useSendCardMessage(), usePatchCard(),
 *   CARD_POLL_MS, REPLY_POLL_MS, HISTORY_PAGE_SIZE, HISTORY_MAX_PAGES.
 * Depends on: @tanstack/react-query, api/api-provider, api/use-card-board, api/use-tickets,
 *   domain/card-chat, schemas/cards.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CardTypeName } from '@forge/core';
import { useForgeApi } from '#/api/api-provider.js';
import { CARDS_KEY, cardEventsKey, cardKey } from '#/api/use-card-board.js';
import { TICKETS_KEY } from '#/api/use-tickets.js';
import { awaitingReply } from '#/domain/card-chat.js';
import type { CardDetailReply, CardHistoryEvent } from '#/schemas/cards.js';
import type { CardHistory } from '#/types/cards-api.types.js';

export const CARD_POLL_MS = 5000;
export const REPLY_POLL_MS = 3000;
export const HISTORY_PAGE_SIZE = 200;
/** 25 x 200 events; past this the transcript says history is cut. */
export const HISTORY_MAX_PAGES = 25;

export function useCardDetail(id: string) {
  const api = useForgeApi();

  return useQuery({
    queryKey: cardKey(id),
    queryFn: ({ signal }) => api.cards.get(id, { signal }),
    refetchInterval: (query) =>
      query.state.data?.director?.state === 'thinking' ? REPLY_POLL_MS : CARD_POLL_MS,
    refetchOnWindowFocus: true,
  });
}

/** The card's whole history, oldest first; polls every 3 s while a reply is awaited. */
export function useCardEvents(id: string) {
  const api = useForgeApi();
  const client = useQueryClient();

  return useQuery<CardHistory>({
    queryKey: cardEventsKey(id),
    queryFn: async ({ signal }) => {
      const events: CardHistoryEvent[] = [];
      let cursor: string | undefined;

      for (let page = 0; page < HISTORY_MAX_PAGES; page += 1) {
        const reply = await api.cards.events(
          id,
          { limit: HISTORY_PAGE_SIZE, ...(cursor === undefined ? {} : { cursor }) },
          { signal },
        );

        events.push(...reply.items);
        if (reply.nextCursor === null) {
          return { events, truncated: false };
        }

        cursor = reply.nextCursor;
      }

      return { events, truncated: true };
    },
    refetchInterval: (query) =>
      client.getQueryData<CardDetailReply>(cardKey(id))?.director?.state === 'thinking' ||
      awaitingReply(query.state.data?.events ?? [])
        ? REPLY_POLL_MS
        : CARD_POLL_MS,
    refetchOnWindowFocus: true,
  });
}

/** Sends a chat message; on success the stored event is added to the cached history. */
export function useSendCardMessage(cardId: string) {
  const api = useForgeApi();
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { text: string; author: string }) =>
      api.cards.send(cardId, input.text, input.author),
    onSuccess: (reply) => {
      client.setQueryData<CardHistory>(cardEventsKey(cardId), (old) =>
        old && !old.events.some((e) => e.seq === reply.event.seq)
          ? { ...old, events: [...old.events, reply.event] }
          : old,
      );

      // Not awaited: the caller clears its unsent line once the cache holds the real event.
      void client.invalidateQueries({ queryKey: cardEventsKey(cardId) });
    },
  });
}

/** Changes the type or closes the card; the board, the card and its history all refresh. */
export function usePatchCard(cardId: string) {
  const api = useForgeApi();
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: { type?: CardTypeName; closed_reason?: string }) =>
      api.cards.patch(cardId, body),
    onSuccess: async (card: CardDetailReply) => {
      client.setQueryData(cardKey(cardId), card);
      await Promise.all([
        client.invalidateQueries({ queryKey: cardEventsKey(cardId) }),
        client.invalidateQueries({ queryKey: CARDS_KEY }),
        client.invalidateQueries({ queryKey: TICKETS_KEY }),
      ]);
    },
  });
}
