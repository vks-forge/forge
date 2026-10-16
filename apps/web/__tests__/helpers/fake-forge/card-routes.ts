/**
 * Stub routes for cards: the project's card list, one card, its history, the type registry,
 * creating a card, setting its relations, patching a card and sending a chat message.
 *
 * Why: the Cards view and the Card page must show their loading, empty, error and chat states
 *   without a Forge server. The routes keep a small mutable store so the sample world behaves
 *   like the real one: a message adds a `user_message` event with the next `seq` and answers
 *   202 with it, a type change writes `type_changed`, a close writes `card_closed` and moves
 *   the card to Closed, a closed card refuses messages with 409 `card_closed`, an unknown id is
 *   404. A create answers 201 with the new card in phase `grilling` (and the first
 *   `user_message`), answers 200 with the first card for a repeated `dedupe_key`, and refuses an
 *   unknown dependency with 404 `card_not_found`; a dependency loop is staged by a test with its
 *   own route. Shapes match `apps/server/src/routes/cards.ts` and `card-patch.ts`; the create
 *   and relations shapes follow docs/briefs/s1-card-flow-foundation.md.
 *
 *   Every card answers an empty plan (no versions, no current, no floor result).
 *
 * Exports: cardRoutes().
 * Depends on: @forge/core (types), helpers/fetch-stub, helpers/forge-data/card-data.
 */

import type { CardSummary } from '#/schemas/cards.js';
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

  const created = new Map<string, string>();

  const detail = (item: SampleCard) => ({
    ...item.summary,
    tickets: [...item.tickets],
    pending_interactions: [...item.pending],
    director: { state: 'idle' },
  });

  return {
    'GET /card-types': () => json({ types: CARD_TYPES }),

    'POST /projects/:slug/cards': ({ params, body }) => {
      const slug = params['slug']!;
      const input = body as {
        title: string;
        description: string;
        type: string;
        priority: CardSummary['priority'];
        depends_on: string[];
        blocks: string[];
        links: string[];
        dedupe_key: string;
      };

      const first = created.get(input.dedupe_key);
      if (first !== undefined) {
        return json({ card: store.get(first)!.summary });
      }

      const unknown = [...input.depends_on, ...input.blocks].find((id) => !store.has(id));
      if (unknown !== undefined) {
        return refusal(404, 'card_not_found', `No card ${unknown}.`);
      }

      const id = `FG-C${store.size + 1}`;
      const now = new Date().toISOString();
      const summary = {
        id,
        project: slug,
        type: input.type,
        title: input.title,
        summary: '',
        source: { kind: 'chat', ref: 'web' },
        created_by: { type: 'user', id: 'owner' },
        created_at: now,
        updated_at: now,
        ticket_count: 0,
        tickets_done: 0,
        column: 'shaping',
        phase: 'grilling',
        needs_you: false,
        phase_version: 0,
        priority: input.priority,
        links: input.links,
        depends_on: input.depends_on,
        blocks: input.blocks,
      } as unknown as CardSummary;

      store.set(id, { summary, tickets: [], pending: [] });
      created.set(input.dedupe_key, id);
      push(id, 'user_message', {
        text: `${input.title}

${input.description}`,
      });

      return { status: 201, body: { card: summary } };
    },

    'PUT /cards/:id/relations': ({ params, body }) => {
      const input = body as { depends_on: string[]; blocks: string[] };
      const next = update(params['id']!, {
        depends_on: input.depends_on,
        blocks: input.blocks,
      });

      return next
        ? json({ card: next.summary })
        : refusal(404, 'card_not_found', `No card ${params['id']}.`);
    },

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

    // The sample cards have no plan; a test that needs one stages its own route.
    'GET /cards/:id/plan': ({ params }) =>
      store.has(params['id']!)
        ? json({ versions: [], current: null, floor: null })
        : refusal(404, 'card_not_found', `No card ${params['id']}.`),

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
