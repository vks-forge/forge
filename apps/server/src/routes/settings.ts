/**
 * `/settings/*`: read, save and audit the company's and each project's settings.
 *
 * Why: settings live in the database as numbered versions (d-0085, d-0090) and the only way
 *   to change them is the UI, which calls these routes. A save names who made it and why,
 *   and the version the editor was looking at; if someone saved in between, the answer is
 *   409 and nothing is overwritten. A document the engine could not run on is refused here
 *   with the offending keys listed, so the owner learns when saving, not when a tick fails.
 *   Scope and project come from the path, so a body cannot aim a save somewhere else.
 *   The Director's own sign-off ceiling is the one setting a project may only lower: a project
 *   value above the company's is a 400, as is `C` (tier C always needs a person).
 *   The engine reads the new version on its next tick; nothing needs a restart.
 *
 * Exports: settingsRoutes().
 * Depends on: @forge/core (ConfigAppend, ConfigVersionConflictError, signOffAboveCeiling), schemas/api,
 *   services/http/{body,http-errors,respond}, types/routes. IO: config source and storage reads.
 */

import {
  ConfigAppend,
  ConfigVersionConflictError,
  signOffAboveCeiling,
} from '@forge/core';
import { CatalogueDoc } from '@forge/tools';
import { CataloguePutBody, SettingsPutBody } from '#/schemas/api.js';
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

  // A project may only lower the Director's sign-off ceiling, never raise the company's.
  if (request.data.scope === 'project') {
    const reason = signOffAboveCeiling(
      (await deps.config.company()).config,
      (request.data.doc as { director?: unknown }).director,
    );

    if (reason !== undefined) {
      throw new HttpError(400, 'invalid_request', reason);
    }
  }

  try {
    const saved = await deps.config.append(request.data);
    // The Director's research provider follows the company's research settings without a restart.
    if (request.data.scope === 'company') {
      await deps.research?.refresh();
    }

    sendJson(ctx.res, 200, saved);
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
    {
      method: 'GET',
      path: '/settings/catalogue',
      async handle({ res }) {
        sendJson(res, 200, await deps.catalogue.current());
      },
    },
    {
      method: 'GET',
      path: '/settings/catalogue/history',
      async handle({ res }) {
        sendJson(res, 200, { versions: await deps.catalogue.history() });
      },
    },
    {
      method: 'PUT',
      path: '/settings/catalogue',
      async handle(ctx) {
        const body = await readJson(ctx.req, CataloguePutBody);
        const doc = CatalogueDoc.safeParse(body.doc);
        if (!doc.success) {
          throw HttpError.fromZod(doc.error);
        }

        try {
          sendJson(
            ctx.res,
            200,
            await deps.catalogue.append({
              doc: doc.data,
              author: body.author,
              reason: body.reason,
              expectedVersion: body.expectedVersion,
            }),
          );
        } catch (error) {
          if (error instanceof ConfigVersionConflictError) {
            throw new HttpError(409, 'version_conflict', error.message);
          }

          throw error;
        }
      },
    },
  ];
}
