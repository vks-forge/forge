/**
 * Stub routes for cards: the project's card list, one card, its history, the type registry,
 * patching a card and sending a chat message.
 *
 * Why: the Cards view and the Card page must show their loading, empty, error and chat states
 *   without a Forge server. The routes keep a small mutable store so the sample world behaves
 *   like the real one: a message adds a `user_message` event with the next `seq` and answers
 *   202 with it, a type change writes `type_changed`, a close writes `card_closed` and moves
 *   the card to Closed, a closed card refuses messages with 409 `card_closed`, an unknown id is
 *   404. Shapes match `apps/server/src/routes/cards.ts` and `card-patch.ts`.
 *
 * Exports: cardRoutes().
 * Depends on: @forge/core (types), helpers/fetch-stub, helpers/forge-data/card-data.
 */

import type { CardSummary } from '@forge/core';
import { json, refusal } from '#tests/helpers/fetch-stub.js';
import type { Routes } from '#tests/helpers/fetch-stub.js';
import {
  CARD_TYPES,
  SAMPLE_CARDS,
  SAMPLE_EVENTS,
} from '#tests/helpers/forge-data/card-data.js';
import type { SampleCard } from '#tests/helpers/forge-data/card-data.js';

const DEFAULT_PAGE = 50;

export function cardRoutes(options: { empty: boolean }): Routes {
  const store = new Map<string, SampleCard>(SAMPLE_CARDS.map((c) => [c.summary.id, c]));
  const events = new Map<string, Record<string, unknown>[]>(
    Object.entries(SAMPLE_EVENTS).map(([id, list]) => [id, [...list]]),
  );

  const push = (id: string, kind: string, payload: Record<string, unknown>) => {
    const list = events.get(id) ?? [];
    const event = {
      seq: list.length,
      kind,
      at: new Date().toISOString(),
      actor: { type: 'user', id: 'owner' },
      payload,
    };

    events.set(id, [...list, event]);

    return event;
  };

  const update = (id: string, change: Partial<CardSummary>): SampleCard | undefined => {
    const found = store.get(id);
    if (!found) {
      return undefined;
    }

    const next = {
      ...found,
      summary: { ...found.summary, ...change, updated_at: new Date().toISOString() },
    };

    store.set(id, next);

    return next;
  };

  const detail = (item: SampleCard) => ({
    ...item.summary,
    tickets: [...item.tickets],
    pending_interactions: [...item.pending],
    director: { state: 'idle' },
  });

  return {
    'GET /card-types': () => json({ types: CARD_TYPES }),

    'GET /projects/:slug/cards': ({ params, query }) => {
      if (params['slug'] !== 'sample-service' && params['slug'] !== 'sample-web') {
        return refusal(404, 'project_not_found', `No project ${params['slug']}.`);
      }

      const column = query.get('column');
      const type = query.get('type');
      const all =
        options.empty || params['slug'] === 'sample-web'
          ? []
          : [...store.values()]
              .map((c) => c.summary)
              .filter((c) => !column || c.column === column)
              .filter((c) => !type || c.type === type)
              .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

      const start = Number(query.get('cursor') ?? 0);
      const end = start + Number(query.get('limit') ?? DEFAULT_PAGE);

      return json({
        items: all.slice(start, end),
        nextCursor: end < all.length ? String(end) : null,
      });
    },

    'GET /cards/:id': ({ params }) => {
      const item = store.get(params['id']!);

      return item && !options.empty
        ? json(detail(item))
        : refusal(404, 'card_not_found', `No card ${params['id']}.`);
    },

    'GET /cards/:id/events': ({ params, query }) => {
      const id = params['id']!;
      if (!store.has(id)) {
        return refusal(404, 'card_not_found', `No card ${id}.`);
      }

      // Same windows as the server: `after` and `before` bound the seq, `desc` is newest first.
      const after = query.get('after');
      const before = query.get('before');
      const desc =
        query.get('order') === 'desc' || (before !== null && query.get('order') === null);

      const limit = Number(query.get('limit') ?? DEFAULT_PAGE);
      const inWindow = (events.get(id) ?? []).filter(
        (e) =>
          (after === null || (e['seq'] as number) > Number(after)) &&
          (before === null || (e['seq'] as number) < Number(before)),
      );

      const ordered = desc ? [...inWindow].reverse() : inWindow;

      return json({ items: ordered.slice(0, limit), nextCursor: null });
    },

    'PATCH /cards/:id': ({ params, body }) => {
      const id = params['id']!;
      const input = body as { type?: string; closed_reason?: string };
      const item = store.get(id);
      if (!item) {
        return refusal(404, 'card_not_found', `No card ${id}.`);
      }

      if (item.summary.closed_reason !== undefined) {
        return refusal(409, 'card_closed', 'a closed card takes no change');
      }

      if (input.type !== undefined) {
        push(id, 'type_changed', { from: item.summary.type, to: input.type });
      }

      if (input.closed_reason !== undefined) {
        push(id, 'card_closed', { reason: input.closed_reason });
      }

      const next = update(id, {
        ...(input.type === undefined ? {} : { type: input.type }),
        ...(input.closed_reason === undefined
          ? {}
          : { closed_reason: input.closed_reason, column: 'closed' as const }),
      });

      return json(detail(next!));
    },

    'POST /cards/:id/messages': ({ params, body }) => {
      const id = params['id']!;
      const item = store.get(id);
      if (!item) {
        return refusal(404, 'card_not_found', `No card ${id}.`);
      }

      if (item.summary.closed_reason !== undefined) {
        return refusal(409, 'card_closed', 'a closed card takes no message');
      }

      const { text } = body as { text: string };

      // A short delay so a test can see the unsent line before the server's copy replaces it.
      return {
        status: 202,
        delayMs: 600,
        body: { event: push(id, 'user_message', { text }) },
      };
    },
  };
}
