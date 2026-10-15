/**
 * Inbox API: list a project's inbox, count it for the sidebar badge, mark an item.
 *
 * Why: the Inbox is where the owner sees what needs a decision or has changed (d-0116). The
 *   items are derived from live rows on every request, so the list can never disagree with the
 *   board; only the owner's read and archive marks are stored. `view` picks needs_action
 *   (default), unread, all or archived. An item whose source changed after it was read or
 *   archived comes back unread and unarchived. `GET .../counts` is the one cheap call the
 *   sidebar badge polls. Marking an item that is not in the inbox right now (never existed,
 *   or its source has gone) is a 404, an unregistered project is a 404, and a bad view, limit
 *   or cursor is a 400. Marks are idempotent.
 *
 * Exports: inboxRoutes().
 * Depends on: @forge/core (inbox rules and schemas), services/inbox-source, services/page-cursor,
 *   services/find-project, services/http/*, types/routes. IO: reads storage and the project's
 *   memory repository, writes marks.
 */

import {
  InboxListQuery,
  applyInboxMarks,
  compareInbox,
  inInboxView,
  inboxCounts,
  markInbox,
  parseInboxItemId,
} from '@forge/core';
import type { InboxItem, InboxMark, InboxPage } from '@forge/core';
import { findProject } from '#/services/find-project.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import { gatherInboxCandidates } from '#/services/inbox-source.js';
import { decodePageCursor, encodePageCursor } from '#/services/page-cursor.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

const MARKS: readonly { path: string; mark: InboxMark }[] = [
  { path: 'read', mark: 'read' },
  { path: 'unread', mark: 'unread' },
  { path: 'archive', mark: 'archive' },
  { path: 'unarchive', mark: 'unarchive' },
];

export function inboxRoutes(deps: RouteDeps): Route[] {
  /** Every item of the project with the owner's marks applied, newest change first. */
  async function load(slug: string, mark?: { itemId: string; mark: InboxMark }) {
    const memory = await deps.memory.reader.list(slug);
    const nowMs = deps.now();

    return deps.storage.transaction(async (tx) => {
      const project = await findProject(tx, slug);
      const candidates = await gatherInboxCandidates(tx, project, memory, nowMs);
      const marks = await tx.inboxStates.listByProject(project.id);
      let items = applyInboxMarks(candidates, marks);
      let marked: InboxItem | undefined;

      if (mark) {
        const target = items.find((i) => i.id === mark.itemId);
        const parsed = parseInboxItemId(mark.itemId);
        if (!target || !parsed) {
          throw new HttpError(
            404,
            'inbox_item_not_found',
            `no inbox item ${mark.itemId}`,
          );
        }

        const row = markInbox(
          project.id,
          target,
          marks.find((m) => m.kind === parsed.kind && m.item_id === parsed.sourceId) ??
            null,
          mark.mark,
          new Date(nowMs).toISOString(),
        );

        await tx.inboxStates.upsert(row);
        const others = marks.filter(
          (m) => !(m.kind === row.kind && m.item_id === row.item_id),
        );

        items = applyInboxMarks(candidates, [...others, row]);

        marked = items.find((i) => i.id === mark.itemId);
      }

      return { items: items.sort(compareInbox), marked };
    });
  }

  const list: Route = {
    method: 'GET',
    path: '/projects/:slug/inbox',
    async handle({ res, params, url }) {
      const parsed = InboxListQuery.safeParse({
        view: url.searchParams.get('view') ?? undefined,
        limit: url.searchParams.get('limit') ?? undefined,
        cursor: url.searchParams.get('cursor') ?? undefined,
      });

      if (!parsed.success) {
        throw HttpError.fromZod(parsed.error);
      }

      const query = parsed.data;
      const after =
        query.cursor === undefined ? undefined : decodePageCursor(query.cursor);

      if (after === null) {
        throw new HttpError(
          400,
          'invalid_cursor',
          'cursor is not one this server issued',
        );
      }

      const { items } = await load(params['slug'] ?? '');
      const visible = items
        .filter((i) => inInboxView(i, query.view))
        .filter(
          (i) => !after || compareInbox(i, { updated_at: after.at, id: after.id }) > 0,
        );

      const shown = visible.slice(0, query.limit);
      const last = shown[shown.length - 1];
      const body: InboxPage = {
        items: shown,
        nextCursor:
          visible.length > query.limit && last
            ? encodePageCursor({ at: last.updated_at, id: last.id })
            : null,
      };

      sendJson(res, 200, body);
    },
  };

  const counts: Route = {
    method: 'GET',
    path: '/projects/:slug/inbox/counts',
    async handle({ res, params }) {
      sendJson(res, 200, inboxCounts((await load(params['slug'] ?? '')).items));
    },
  };

  const marks = MARKS.map(({ path, mark }): Route => ({
    method: 'POST',
    path: `/projects/:slug/inbox/:itemId/${path}`,
    async handle({ res, params }) {
      const { marked } = await load(params['slug'] ?? '', {
        itemId: params['itemId'] ?? '',
        mark,
      });

      sendJson(res, 200, marked);
    },
  }));

  return [list, counts, ...marks];
}
