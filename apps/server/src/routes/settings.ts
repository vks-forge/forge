/**
 * `/settings/*`: read, save and audit the company's and each project's settings.
 *
 * Why: settings live in the database as numbered versions (d-0085, d-0090) and the only way
 *   to change them is the UI, which calls these routes. A save names who made it and why,
 *   and the version the editor was looking at; if someone saved in between, the answer is
 *   409 and nothing is overwritten. A document the engine could not run on is refused here
 *   with the offending keys listed, so the owner learns when saving, not when a tick fails.
 *   Scope and project come from the path, so a body cannot aim a save somewhere else.
 *   The engine reads the new version on its next tick; nothing needs a restart.
 *
 * Exports: settingsRoutes().
 * Depends on: @forge/core (ConfigAppend, ConfigVersionConflictError), schemas/api,
 *   services/http/{body,http-errors,respond}, types/routes. IO: config source and storage reads.
 */

import { ConfigAppend, ConfigVersionConflictError } from '@forge/core';
import { SettingsPutBody } from '#/schemas/api.js';
import { readJson } from '#/services/http/body.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import type { Route, RouteContext } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

/** The registered project named in the path, or 404. */
async function requireProject(deps: RouteDeps, ctx: RouteContext): Promise<string> {
  const slug = ctx.params['slug'] ?? '';
  const known = await deps.storage.transaction(async (tx) =>
    (await tx.projects.list()).some((p) => p.slug === slug),
  );

  if (!known) {
    throw new HttpError(404, 'project_not_found', `no project ${slug}`);
  }

  return slug;
}

/** Validates the body into an append request for the scope and saves it; maps the two expected failures. */
async function save(
  deps: RouteDeps,
  ctx: RouteContext,
  scope: { scope: 'company' } | { scope: 'project'; project: string },
): Promise<void> {
  const body = await readJson(ctx.req, SettingsPutBody);
  const request = ConfigAppend.safeParse({ ...scope, ...body });
  if (!request.success) {
    throw HttpError.fromZod(request.error);
  }

  try {
    sendJson(ctx.res, 200, await deps.config.append(request.data));
  } catch (error) {
    if (error instanceof ConfigVersionConflictError) {
      throw new HttpError(409, 'version_conflict', error.message);
    }

    throw error;
  }
}

export function settingsRoutes(deps: RouteDeps): Route[] {
  return [
    {
      method: 'GET',
      path: '/settings/company',
      async handle({ res }) {
        sendJson(res, 200, await deps.config.company());
      },
    },
    {
      method: 'PUT',
      path: '/settings/company',
      handle: (ctx) => save(deps, ctx, { scope: 'company' }),
    },
    {
      method: 'GET',
      path: '/settings/company/history',
      async handle({ res }) {
        sendJson(res, 200, { versions: await deps.config.history('company') });
      },
    },
    {
      method: 'GET',
      path: '/settings/projects/:slug',
      async handle(ctx) {
        const slug = await requireProject(deps, ctx);
        sendJson(ctx.res, 200, await deps.config.project(slug));
      },
    },
    {
      method: 'PUT',
      path: '/settings/projects/:slug',
      async handle(ctx) {
        const project = await requireProject(deps, ctx);
        await save(deps, ctx, { scope: 'project', project });
      },
    },
    {
      method: 'GET',
      path: '/settings/projects/:slug/history',
      async handle(ctx) {
        const slug = await requireProject(deps, ctx);
        sendJson(ctx.res, 200, { versions: await deps.config.history('project', slug) });
      },
    },
  ];
}
