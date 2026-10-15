/**
 * Project memory API: list records, read one, approve or reject a proposal.
 *
 * Why: the Director infers things about a project (a stack pick, a lesson) and may only
 *   propose them; a proposal becomes a constraint on later planning only when the owner
 *   says so (d-0007). This is where the owner says it, from the UI. The routes only read
 *   and answer: nothing here creates a decision, and the Worker has no route to any of it.
 *   Answering a proposal that was already answered is a 409, so a double click or two
 *   open tabs cannot flip an earlier answer. The `author` in the body is kept in the
 *   record and in the commit so the history says who decided.
 *
 * Exports: memoryRoutes().
 * Depends on: @forge/core (memory errors), schemas/api, services/http/*, types/routes.
 *   IO: reads storage for the project; reads and writes the project's memory repository.
 */

import { MemoryRecordNotFoundError, MemoryRecordStateError } from '@forge/core';
import { MemoryApproveBody, MemoryRejectBody } from '#/schemas/api.js';
import { readJson } from '#/services/http/body.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import type { Route, RouteContext } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

async function requireProject(deps: RouteDeps, slug: string): Promise<void> {
  const projects = await deps.storage.transaction((tx) => tx.projects.list());
  if (!projects.some((p) => p.slug === slug)) {
    throw new HttpError(404, 'project_not_found', `no project ${slug}`);
  }
}

/** Runs a write and maps "no such record" and "already answered" to 404 and 409. */
async function answered<T>(id: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (error instanceof MemoryRecordNotFoundError) {
      throw new HttpError(404, 'memory_record_not_found', `no memory record ${id}`);
    }

    if (error instanceof MemoryRecordStateError) {
      throw new HttpError(409, 'not_a_pending_proposal', error.message);
    }

    throw error;
  }
}

export function memoryRoutes(deps: RouteDeps): Route[] {
  const target = async (ctx: RouteContext) => {
    const slug = ctx.params['slug'] ?? '';
    const id = ctx.params['id'] ?? '';
    await requireProject(deps, slug);

    return { slug, id };
  };

  return [
    {
      method: 'GET',
      path: '/projects/:slug/memory',
      async handle(ctx) {
        const slug = ctx.params['slug'] ?? '';
        await requireProject(deps, slug);
        sendJson(ctx.res, 200, { records: await deps.memory.reader.list(slug) });
      },
    },
    {
      method: 'GET',
      path: '/projects/:slug/memory/:id',
      async handle(ctx) {
        const { slug, id } = await target(ctx);
        const record = await deps.memory.reader.get(slug, id);
        if (!record) {
          throw new HttpError(404, 'memory_record_not_found', `no memory record ${id}`);
        }

        sendJson(ctx.res, 200, { record });
      },
    },
    {
      method: 'POST',
      path: '/projects/:slug/memory/proposals/:id/approve',
      async handle(ctx) {
        const { slug, id } = await target(ctx);
        const body = await readJson(ctx.req, MemoryApproveBody);
        const { commit } = await answered(id, () =>
          deps.memory.writer.approve(slug, id, body.author),
        );

        sendJson(ctx.res, 200, {
          record: await deps.memory.reader.get(slug, id),
          commit,
        });
      },
    },
    {
      method: 'POST',
      path: '/projects/:slug/memory/proposals/:id/reject',
      async handle(ctx) {
        const { slug, id } = await target(ctx);
        const body = await readJson(ctx.req, MemoryRejectBody);
        const { commit } = await answered(id, () =>
          deps.memory.writer.reject(slug, id, body.reason, body.author),
        );

        sendJson(ctx.res, 200, {
          record: await deps.memory.reader.get(slug, id),
          commit,
        });
      },
    },
  ];
}
