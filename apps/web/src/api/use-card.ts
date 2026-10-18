/**
 * TanStack Query hooks for one card: its detail, its history, loading older history, sending a
 * chat message and patching it (type change, close).
 *
 * Why: the Card page is a conversation with the card's Director, so it must show a reply soon
 *   after it exists without hammering the server. The detail and the history refetch slowly
 *   (5 s) and every 3 s while a reply is awaited (the Director is thinking, or the user just
 *   sent a message and no Director message follows it), and pause while the tab is hidden; while the project stream is open the slow poll is 30 s
 *   (the reply poll stays 3 s). The history is held as a window by `seq`: the first read is the newest page, each poll asks only
 *   for events after the newest one held, and "load older" asks for the page below the oldest
 *   one held, so a long history costs one small request per poll however long it is. A send is
 *   optimistic in the view: it appends an unsent line, and on success the server's own event
 *   replaces it in the cache, on refusal the line is removed and the draft is untouched.
 *   Patching writes the returned card into the cache so the header changes at once.
 *
 * Exports: useCardDetail(), useCardEvents(), useLoadOlderEvents(), useSendCardMessage(),
 *   usePatchCard(), useCreateCard(), mergeEvents(), CARD_POLL_MS, REPLY_POLL_MS,
 *   HISTORY_PAGE_SIZE.
 * Depends on: @tanstack/react-query, api/api-provider, api/poll-interval, api/use-card-board,
 *   api/use-tickets, domain/card-chat, schemas/cards, schemas/new-card (type).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NewCardInput } from '#/schemas/new-card.js';
import { useForgeApi } from '#/api/api-provider.js';
import { useRefetchMs } from '#/api/poll-interval.js';
import { CARDS_KEY, cardEventsKey, cardKey } from '#/api/use-card-board.js';
import { TICKETS_KEY } from '#/api/use-tickets.js';
import { awaitingReply } from '#/domain/card-chat.js';
import type { CardDetailReply, CardHistoryEvent } from '#/schemas/cards.js';
import type { CardHistory, CardPatchInput } from '#/types/cards-api.types.js';

export const CARD_POLL_MS = 5000;
export const REPLY_POLL_MS = 3000;
/** Events per window: the first read, each poll step and each "load older". */
export const HISTORY_PAGE_SIZE = 50;

export function useCardDetail(id: string) {
  const api = useForgeApi();
  const pollMs = useRefetchMs(CARD_POLL_MS);

  return useQuery({
    queryKey: cardKey(id),
    queryFn: ({ signal }) => api.cards.get(id, { signal }),
    refetchInterval: (query) =>
      query.state.data?.director.state === 'thinking' ? REPLY_POLL_MS : pollMs,
    refetchOnWindowFocus: true,
  });
}

/** Merges event windows into one list ordered and deduplicated by `seq`. */
export function mergeEvents(
  ...windows: (readonly CardHistoryEvent[])[]
): readonly CardHistoryEvent[] {
  const bySeq = new Map<number, CardHistoryEvent>();
  for (const event of windows.flat()) {
    bySeq.set(event.seq, event);
  }

  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

/** True when a full window came back and the oldest event is not the first one ever. */
function olderMayExist(
  window: readonly CardHistoryEvent[],
  events: readonly CardHistoryEvent[],
) {
  return window.length === HISTORY_PAGE_SIZE && (events[0]?.seq ?? 0) > 0;
}

/**
 * The card's recent history, oldest first. The first read is the newest page; every poll asks
 * only for events after the newest one held. Polls every 3 s while a reply is awaited.
 */
export function useCardEvents(id: string) {
  const api = useForgeApi();
  const pollMs = useRefetchMs(CARD_POLL_MS);
  const client = useQueryClient();

  return useQuery<CardHistory>({
    queryKey: cardEventsKey(id),
    queryFn: async ({ signal }) => {
      const held = client.getQueryData<CardHistory>(cardEventsKey(id));
      if (held === undefined || held.events.length === 0) {
        const page = await api.cards.events(
          id,
          { order: 'desc', limit: HISTORY_PAGE_SIZE },
          { signal },
        );

        const events = mergeEvents(page.items);

        return { events, hasOlder: olderMayExist(page.items, events) };
      }

      // A busy card may have more than one window of news: read until one comes back short.
      let events = held.events;
      let more = true;
      while (more) {
        const page = await api.cards.events(
          id,
          { after: events.at(-1)?.seq ?? 0, order: 'asc', limit: HISTORY_PAGE_SIZE },
          { signal },
        );

        events = mergeEvents(events, page.items);
        more = page.items.length === HISTORY_PAGE_SIZE;
      }

      return { events, hasOlder: held.hasOlder };
    },
    refetchInterval: (query) =>
      client.getQueryData<CardDetailReply>(cardKey(id))?.director.state === 'thinking' ||
      awaitingReply(query.state.data?.events ?? [])
        ? REPLY_POLL_MS
        : pollMs,
    refetchOnWindowFocus: true,
  });
}

/** "Load older": the newest events below the oldest one held, added to the cached history. */
export function useLoadOlderEvents(cardId: string) {
  const api = useForgeApi();
  const client = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const held = client.getQueryData<CardHistory>(cardEventsKey(cardId));
      const oldest = held?.events[0];
      if (held === undefined || oldest === undefined) {
        return;
      }

      const page = await api.cards.events(cardId, {
        before: oldest.seq,
        limit: HISTORY_PAGE_SIZE,
      });

      const events = mergeEvents(held.events, page.items);
      client.setQueryData<CardHistory>(cardEventsKey(cardId), {
        events,
        hasOlder: olderMayExist(page.items, events),
      });
    },
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
        old ? { ...old, events: mergeEvents(old.events, [reply.event]) } : old,
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
    mutationFn: (body: CardPatchInput) => api.cards.patch(cardId, body),
    onSuccess: async (card: CardDetailReply) => {
      client.setQueryData(cardKey(cardId), card);
      await Promise.all([
        client.invalidateQueries({ queryKey: cardEventsKey(cardId) }),
        client.invalidateQueries({ queryKey: CARDS_KEY }),
        client.invalidateQueries({ queryKey: TICKETS_KEY }),
        // A cap change can raise or clear a budget warning, which lives in the Inbox.
        client.invalidateQueries({ queryKey: ['inbox'] }),
      ]);
    },
  });
}

/** Creates a card; the Board's list refetches so it appears (the stream does the same live). */
export function useCreateCard(slug: string) {
  const api = useForgeApi();
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: NewCardInput) => api.cards.create(slug, input),
    onSuccess: () => client.invalidateQueries({ queryKey: [...CARDS_KEY, slug] }),
  });
}
