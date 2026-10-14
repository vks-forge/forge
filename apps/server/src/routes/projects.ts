/**
 * Projects API: list, register an existing local clone, archive.
 *
 * Why: one Forge install works on many repositories (d-0082) and the UI is the only
 *   control surface (d-0090), so adding a project cannot mean editing files and restarting.
 *   Registering is where a bad setup must be caught: a folder that is not a clone, a
 *   missing base branch, a git host the server cannot build, or a prefix another project
 *   already uses (ticket ids would collide) are all refused with a plain message before
 *   anything is saved. Once checked, the project's first settings version and its row are
 *   written and the registry starts serving it, so tickets can run in it on the next tick
 *   with no restart. Archiving stops new work but deletes nothing.
 *
 * Exports: projectsRoutes().
 * Depends on: node:path, @forge/core, @forge/git (inspectRepository), schemas/api,
 *   services/http/*, types/routes. IO: storage, settings, reads the clone through git.
 */

import { isAbsolute, resolve } from 'node:path';
import {
  BUILTIN_CONFIG,
  ConfigVersionConflictError,
  InvalidInputError,
  ProjectOverride,
  mergeConfig,
} from '@forge/core';
import type { GitHostConfig, Project } from '@forge/core';
import { inspectRepository } from '@forge/git';
import { ProjectCreateBody, ProjectPatchBody } from '#/schemas/api.js';
import { readJson } from '#/services/http/body.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

/** What the API shows of a project row; the deprecated tier-C column is left out. */
function view(project: Project) {
  const { tier_c_globs: _deprecated, harness_defaults: _defaults, ...rest } = project;
  void _deprecated;
  void _defaults;

  return rest;
}

const samePath = (a: string, b: string): boolean =>
  process.platform === 'win32'
    ? resolve(a).toLowerCase() === resolve(b).toLowerCase()
    : resolve(a) === resolve(b);

/** The `git_host` settings of a new project, from either way of naming it. */
async function hostOf(
  deps: RouteDeps,
  body: ProjectCreateBody,
): Promise<{ host: GitHostConfig; repoFullName?: string }> {
  if (body.git_host) {
    const host = body.base_branch
      ? { ...body.git_host, base_branch: body.base_branch }
      : body.git_host;

    return { host };
  }

  const id = body.connection_id ?? '';
  const connection = await deps.storage.transaction((tx) => tx.githubConnections.get(id));
  if (!connection) {
    throw new HttpError(404, 'connection_not_found', `no GitHub connection ${id}`);
  }

  if (connection.status !== 'active') {
    throw new HttpError(409, 'connection_disabled', `connection ${id} is disabled`);
  }

  const [owner = '', repo = ''] = (body.repo_full_name ?? '').split('/');

  return {
    repoFullName: `${owner}/${repo}`,
    host: {
      kind: 'github',
      owner,
      repo,
      base_branch: body.base_branch ?? 'main',
      installation_id: body.installation_id ?? '',
    },
  };
}

async function create(
  deps: RouteDeps,
  ctx: Parameters<Route['handle']>[0],
): Promise<void> {
  const body = await readJson(ctx.req, ProjectCreateBody);
  if (!isAbsolute(body.local_path)) {
    throw new HttpError(400, 'invalid_local_path', 'local_path must be an absolute path');
  }

  const existing = await deps.storage.transaction((tx) => tx.projects.list());
  if (existing.some((p) => p.slug === body.slug)) {
    throw new HttpError(409, 'project_exists', `project ${body.slug} already exists`);
  }

  if (existing.some((p) => p.prefix === body.prefix)) {
    throw new HttpError(
      409,
      'prefix_in_use',
      `ticket prefix ${body.prefix} belongs to another project; ticket ids would collide`,
    );
  }

  if (existing.some((p) => p.local_path && samePath(p.local_path, body.local_path))) {
    throw new HttpError(409, 'path_in_use', 'another project already uses this folder');
  }

  const { host, repoFullName } = await hostOf(deps, body);
  const inspected = await inspectRepository({
    path: body.local_path,
    baseBranch: host.base_branch,
  });

  if (!inspected.ok) {
    throw new HttpError(400, inspected.code, inspected.message);
  }

  const { doc, settings } = settingsOf({ ...body.settings, git_host: host });

  const project: Project = {
    id: body.slug,
    slug: body.slug,
    prefix: body.prefix,
    local_path: body.local_path,
    ...(body.connection_id ? { connection_id: body.connection_id } : {}),
    ...(repoFullName ? { repo_full_name: repoFullName } : {}),
    status: 'ready',
    ecosystems: [],
    harness_defaults: {},
    tier_c_globs: [],
  };

  // Build the runtime once before saving: a git host that cannot be built is a 400 now,
  // not a ticket that fails weeks later.
  try {
    await deps.projects.check(project, settings);
  } catch (error) {
    throw new HttpError(400, 'project_not_servable', messageOf(error));
  }

  try {
    await deps.config.append({
      scope: 'project',
      project: body.slug,
      doc,
      author: body.author,
      reason: body.reason,
      expectedVersion: 0,
    });
  } catch (error) {
    if (error instanceof ConfigVersionConflictError) {
      throw new HttpError(
        409,
        'settings_exist',
        `settings already exist for ${body.slug}`,
      );
    }

    throw error;
  }

  await deps.storage.transaction((tx) => tx.projects.upsert(project));
  await deps.projects.register(project, await deps.config.project(body.slug));
  sendJson(ctx.res, 201, { project: view(project), settings_version: 1 });
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** The override document to store and the effective project settings it yields; 400 when invalid. */
function settingsOf(raw: unknown) {
  try {
    const doc = ProjectOverride.parse(raw);

    return { doc, settings: mergeConfig(BUILTIN_CONFIG, {}, doc).project };
  } catch (error) {
    const cause = error instanceof InvalidInputError ? error.cause : error;
    throw new HttpError(
      400,
      'invalid_settings',
      `invalid project settings: ${messageOf(cause)}`,
    );
  }
}

export function projectsRoutes(deps: RouteDeps): Route[] {
  return [
    {
      method: 'GET',
      path: '/projects',
      async handle({ res }) {
        const projects = await deps.storage.transaction((tx) => tx.projects.list());
        sendJson(res, 200, { projects: projects.map(view) });
      },
    },
    {
      method: 'POST',
      path: '/projects',
      handle: (ctx) => create(deps, ctx),
    },
    {
      method: 'PATCH',
      path: '/projects/:slug',
      async handle(ctx) {
        const slug = ctx.params['slug'] ?? '';
        await readJson(ctx.req, ProjectPatchBody);
        const updated = await deps.storage.transaction(async (tx) => {
          const found = (await tx.projects.list()).find((p) => p.slug === slug);
          if (!found) {
            return null;
          }

          const next: Project = { ...found, status: 'archived' };
          await tx.projects.upsert(next);

          return next;
        });

        if (!updated) {
          throw new HttpError(404, 'project_not_found', `no project ${slug}`);
        }

        deps.projects.archive(slug);
        sendJson(ctx.res, 200, { project: view(updated) });
      },
    },
  ];
}
