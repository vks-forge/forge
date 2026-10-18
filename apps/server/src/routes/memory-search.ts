/**
 * Memory search and admin API: search, history, related records, import status and retry, export, access log.
 *
 * Why: the owner needs to find a decision by its words, see how a record came to be (who wrote it, every move
 *   and change to its search aids), what is related to it, whether the project's memory has moved into the
 *   database (and, when it has not, which files could not be read and why, with a Retry), a markdown export
 *   to review, and the log of what searches asked of memory so misses can be seen. Everything here reads; the
 *   only writes are the retry of an import and the export, both through the admin port. There is no route to
 *   edit or delete a record: records are never changed, a change is a new record that supersedes the old one.
 *   Search is the owner's own (no Director rewrite, no scope): a project still on its old repository answers
 *   409 `memory_not_migrated` and the screen falls back to filtering the list it already has.
 *
 * Exports: memorySearchRoutes().
 * Depends on: @forge/core, schemas/memory-api, services/http/*, services/memory-migration, types/routes.
 *   IO: reads storage through the index; writes only through the admin port.
 */

import { MEMORY_ID_PATTERN } from '@forge/core';
import {
  AccessLogParams,
  MemorySearchParams,
  searchParamsOf,
} from '#/schemas/memory-api.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import { MemoryImportRunningError } from '#/services/memory-migration.js';
import type { MemoryAdmin } from '#/types/memory-admin.types.js';
import type { Route, RouteContext } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

function need<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new HttpError(503, 'not_available', `${what} is not available on this server`);
  }

  return value;
}

export function memorySearchRoutes(deps: RouteDeps): Route[] {
  async function project(ctx: RouteContext): Promise<string> {
    const slug = ctx.params['slug'] ?? '';
    const projects = await deps.storage.transaction((tx) => tx.projects.list());
    if (!projects.some((p) => p.slug === slug)) {
      throw new HttpError(404, 'project_not_found', `no project ${slug}`);
    }

    return slug;
  }

  const index = () => need(deps.memoryIndex, 'memory search');
  const admin = (): MemoryAdmin => need(deps.memoryAdmin, 'memory administration');

  /** 404 unless the record exists in the project (the owner's view: nothing is hidden). */
  async function requireRecord(slug: string, id: string): Promise<void> {
    const found = MEMORY_ID_PATTERN.test(id)
      ? await index().get(slug, [id], { actor: 'web' })
      : { records: [] };

    if (found.records.length === 0) {
      throw new HttpError(404, 'memory_record_not_found', `no memory record ${id}`);
    }
  }

  return [
    {
      method: 'GET',
      path: '/projects/:slug/memory/search',
      async handle(ctx) {
        const slug = await project(ctx);
        const parsed = MemorySearchParams.safeParse(searchParamsOf(ctx.url));
        if (!parsed.success) {
          throw HttpError.fromZod(parsed.error);
        }

        if ((await admin().backend(slug)) === 'files') {
          throw new HttpError(
            409,
            'memory_not_migrated',
            `memory of ${slug} is still on its old repository; search is available once it is moved`,
          );
        }

        const p = parsed.data;
        const reply = await index().search({
          project: slug,
          text: p.q,
          actor: 'web',
          ...(p.kind.length > 0 ? { kinds: p.kind } : {}),
          ...(p.status.length > 0
            ? { status: p.status }
            : p.superseded === '1'
              ? {
                  status: ['active', 'rejected', 'superseded'] as (
                    'active' | 'rejected' | 'superseded'
                  )[],
                }
              : {}),
          ...(p.tag.length > 0 ? { tags: p.tag } : {}),
          k: p.k,
          offset: p.offset,
        });

        sendJson(ctx.res, 200, reply);
      },
    },
    {
      method: 'GET',
      path: '/projects/:slug/memory/import',
      async handle(ctx) {
        const slug = await project(ctx);
        sendJson(ctx.res, 200, await admin().importStatus(slug));
      },
    },
    {
      method: 'POST',
      path: '/projects/:slug/memory/import',
      async handle(ctx) {
        const slug = await project(ctx);
        try {
          sendJson(ctx.res, 200, await admin().runImport(slug));
        } catch (error) {
          if (error instanceof MemoryImportRunningError) {
            throw new HttpError(409, 'memory_import_running', error.message);
          }

          throw error;
        }
      },
    },
    {
      method: 'POST',
      path: '/projects/:slug/memory/export',
      async handle(ctx) {
        const slug = await project(ctx);
        if ((await admin().backend(slug)) === 'files') {
          throw new HttpError(
            409,
            'memory_not_migrated',
            `memory of ${slug} is still on its old repository; export is available once it is moved`,
          );
        }

        sendJson(ctx.res, 200, await admin().exportTo(slug));
      },
    },
    {
      method: 'GET',
      path: '/projects/:slug/memory/access-log',
      async handle(ctx) {
        const slug = await project(ctx);
        const parsed = AccessLogParams.safeParse({
          limit: ctx.url.searchParams.get('limit') ?? undefined,
        });

        if (!parsed.success) {
          throw HttpError.fromZod(parsed.error);
        }

        sendJson(ctx.res, 200, {
          rows: await admin().accessLog(slug, parsed.data.limit),
        });
      },
    },
    {
      method: 'GET',
      path: '/projects/:slug/memory/:id/history',
      async handle(ctx) {
        const slug = await project(ctx);
        const id = ctx.params['id'] ?? '';
        await requireRecord(slug, id);
        const history = await index().history(slug, id);

        sendJson(ctx.res, 200, history ?? { events: [], versions: [] });
      },
    },
    {
      method: 'GET',
      path: '/projects/:slug/memory/:id/related',
      async handle(ctx) {
        const slug = await project(ctx);
        const id = ctx.params['id'] ?? '';
        await requireRecord(slug, id);
        const related = await index().related(slug, id, 5, { actor: 'web' });

        sendJson(ctx.res, 200, { related: related ?? [] });
      },
    },
  ];
}
