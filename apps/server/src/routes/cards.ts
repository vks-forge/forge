/**
 * Card reads: `GET /projects/:slug/cards`, `GET /cards/:id`, `GET /cards/:id/events` and
 * `GET /card-types`.
 *
 * Why: every intake is a card (d-0105), and the Board, the Card page and the type picker
 *   read them here. The Board column is computed per request from the card's tickets and
 *   pending questions (d-0107), so a `column` filter cannot be a SQL `WHERE`: the route scans
 *   the project's cards newest change first, rolls each up and keeps the matches, and pages by
 *   an opaque cursor over (`updated_at`, `id`) so a card that moves while the user scrolls
 *   cannot show twice or vanish. History is read oldest first by `seq`. An unregistered slug
 *   or unknown card is 404, a malformed card id, parameter or cursor is 400.
 *
 * Exports: cardRoutes().
 * Depends on: @forge/core (card schemas), services/card-view, services/find-project,
 *   services/page-cursor, services/seq-cursor, services/http/*, routes/card-patch, routes/card-messages,
 *   types/routes. IO: reads storage.
 */

import { CardEventsQuery, CardId, CardListQuery } from '@forge/core';
import type { CardEventsPage, CardListPage, CardSummary } from '@forge/core';
import type { ZodType } from 'zod';
import { cardMessageRoute } from '#/routes/card-messages.js';
import { cardPatchRoute } from '#/routes/card-patch.js';
import { cardDetail, summarizeCard, viewCard } from '#/services/card-view.js';
import { findProject } from '#/services/find-project.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import { decodePageCursor, encodePageCursor } from '#/services/page-cursor.js';
import { decodeSeqCursor, encodeSeqCursor } from '#/services/seq-cursor.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

/** Cards read from storage per scan step while a column filter looks for matches. */
const SCAN_BATCH = 100;

function parseQuery<T>(schema: ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw HttpError.fromZod(parsed.error);
  }

  return parsed.data;
}

export function cardRoutes(deps: RouteDeps): Route[] {
  const list: Route = {
    method: 'GET',
    path: '/projects/:slug/cards',
    async handle({ res, params, url }) {
      const slug = params['slug'] ?? '';
      const parsed = CardListQuery.safeParse({
        column: url.searchParams.get('column') ?? undefined,
        type: url.searchParams.get('type') ?? undefined,
        limit: url.searchParams.get('limit') ?? undefined,
        cursor: url.searchParams.get('cursor') ?? undefined,
      });

      if (!parsed.success) {
        throw HttpError.fromZod(parsed.error);
      }

      const query = parsed.data;
      let after = query.cursor === undefined ? undefined : decodePageCursor(query.cursor);
      if (after === null) {
        throw new HttpError(
          400,
          'invalid_cursor',
          'cursor is not one this server issued',
        );
      }

      const page = await deps.storage.transaction(async (tx) => {
        const project = await findProject(tx, slug);
        const pending = await tx.interactions.listPending();
        const items: CardSummary[] = [];
        let more = true;

        while (items.length <= query.limit && more) {
          const rows = await tx.cards.listByProject(project.id, {
            ...(query.type === undefined ? {} : { type: query.type }),
            limit: SCAN_BATCH,
            ...(after ? { after: { updated_at: after.at, id: after.id } } : {}),
          });

          for (const card of rows) {
            const view = await viewCard(tx, card, pending);
            if (query.column === undefined || view.column === query.column) {
              items.push(summarizeCard(view, slug));
            }
          }

          const last = rows[rows.length - 1];
          more = rows.length === SCAN_BATCH;
          after = last ? { at: last.updated_at, id: last.id } : after;
        }

        const shown = items.slice(0, query.limit);
        const edge = shown[shown.length - 1];
        const body: CardListPage = {
          items: shown,
          nextCursor:
            items.length > query.limit && edge
              ? encodePageCursor({ at: edge.updated_at, id: edge.id })
              : null,
        };

        return body;
      });

      sendJson(res, 200, page);
    },
  };

  const detail: Route = {
    method: 'GET',
    path: '/cards/:id',
    async handle({ res, params }) {
      const id = CardId.safeParse(params['id']);
      if (!id.success) {
        throw new HttpError(400, 'invalid_card_id', 'card id must look like FG-C12');
      }

      const body = await deps.storage.transaction(async (tx) => {
        const card = await tx.cards.get(id.data);
        if (!card) {
          return null;
        }

        const slug = (await tx.projects.get(card.project))?.slug ?? card.project;
        const view = await viewCard(tx, card, await tx.interactions.listPending());

        return cardDetail(tx, view, slug, deps.engine.cardDirector(card.id));
      });

      if (!body) {
        throw new HttpError(404, 'card_not_found', `no card ${id.data}`);
      }

      sendJson(res, 200, body);
    },
  };

  const events: Route = {
    method: 'GET',
    path: '/cards/:id/events',
    async handle({ res, params, url }) {
      const id = CardId.safeParse(params['id']);
      if (!id.success) {
        throw new HttpError(400, 'invalid_card_id', 'card id must look like FG-C12');
      }

      const query = parseQuery(CardEventsQuery, {
        after: url.searchParams.get('after') ?? undefined,
        before: url.searchParams.get('before') ?? undefined,
        order: url.searchParams.get('order') ?? undefined,
        limit: url.searchParams.get('limit') ?? undefined,
        cursor: url.searchParams.get('cursor') ?? undefined,
      });

      if (
        query.cursor !== undefined &&
        (query.after !== undefined || query.before !== undefined)
      ) {
        throw new HttpError(
          400,
          'invalid_query',
          'cursor cannot be combined with after or before',
        );
      }

      const cursorSeq =
        query.cursor === undefined ? undefined : decodeSeqCursor(query.cursor);

      if (cursorSeq === null) {
        throw new HttpError(
          400,
          'invalid_cursor',
          'cursor is not one this server issued',
        );
      }

      // `before` alone means "the newest N before it"; a cursor continues in the page's own order.
      const order = query.order ?? (query.before === undefined ? 'asc' : 'desc');
      const afterSeq = order === 'asc' ? (cursorSeq ?? query.after) : query.after;
      const beforeSeq = order === 'desc' ? (cursorSeq ?? query.before) : query.before;

      const page = await deps.storage.transaction(async (tx) => {
        if (!(await tx.cards.get(id.data))) {
          return null;
        }

        // One extra row tells whether another page exists without a second query.
        const rows = await tx.cardEvents.list(id.data, {
          ...(afterSeq === undefined ? {} : { afterSeq }),
          ...(beforeSeq === undefined ? {} : { beforeSeq }),
          order,
          limit: query.limit + 1,
        });

        const shown = rows.slice(0, query.limit);
        const last = shown[shown.length - 1];
        const body: CardEventsPage = {
          items: shown,
          nextCursor:
            rows.length > query.limit && last ? encodeSeqCursor(last.seq) : null,
        };

        return body;
      });

      if (!page) {
        throw new HttpError(404, 'card_not_found', `no card ${id.data}`);
      }

      sendJson(res, 200, page);
    },
  };

  const types: Route = {
    method: 'GET',
    path: '/card-types',
    async handle({ res }) {
      const rows = await deps.storage.transaction((tx) => tx.cardTypes.list());

      sendJson(res, 200, { types: rows });
    },
  };

  return [list, detail, events, types, cardPatchRoute(deps), cardMessageRoute(deps)];
}
