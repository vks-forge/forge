/**
 * Projects API: list, register a project on any folder, archive and unarchive.
 *
 * Why: one Forge install works on many repositories (d-0082) and the UI is the only
 *   control surface (d-0090), so adding a project cannot mean editing files and restarting.
 *   Registering is where a bad setup must be caught: a folder that is not a clone, a
 *   missing base branch, a git host the server cannot build, or a prefix another project
 *   already uses (ticket ids would collide) are all refused with a plain message before
 *   anything is saved. A folder inside Forge's own data home (its memory repositories and
 *   Worker worktrees) is refused too, so the floor between what Workers may touch and what
 *   only the Director writes cannot be inverted by naming the wrong folder. Once checked,
 *   the project's row and first settings version are written and the registry starts
 *   serving it, so tickets can run in it on the next tick with no restart; a failure part
 *   way removes the row so the same request can be sent again. The slug, prefix and folder
 *   are claimed inside the transaction that saves the row, so two requests racing for the same
 *   one cannot both succeed. Archiving stops new work but
 *   deletes nothing and can be undone (`PATCH {status:'ready'}`, services/project-status;
 *   delete lives in routes/project-delete). The list shows `config_error` for a project the engine skips.
 *
 *   Any folder can be a project (d-0124). A folder with no git needs `git_setup` (snapshot
 *   commit or init only) and a folder inside a repository needs `scope` (repository top or
 *   only that subfolder); both are refused with a plain 400 when missing, before anything is
 *   written. Without a `git_host` or GitHub connection the project has no remote and merges
 *   locally into its own repository. Starting the repository is the last step before the
 *   project is registered, so a refused request never changes the user's folder. The row records the
 *   ecosystems the server detects in the folder (`POST /projects/:slug/detected` looks again).
 *
 * Exports: projectsRoutes().
 * Depends on: @forge/core, @forge/git (inspectRepository, listBranches), @forge/gates (detectProjectAt), schemas/api,
 *   services/http/*, services/project-folder, services/project-conflict, services/project-placement,
 *   services/project-inspect, types/routes. IO: storage, settings, reads the clone through git.
 */

import {
  BUILTIN_CONFIG,
  InvalidInputError,
  ProjectOverride,
  mergeConfig,
} from '@forge/core';
import type { Project } from '@forge/core';
import { detectProjectAt } from '@forge/gates';
import { ProjectCreateBody, ProjectPatchBody } from '#/schemas/api.js';
import { readJson } from '#/services/http/body.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import { appendFirstSettings } from '#/services/first-settings.js';
import { assertProjectFolder } from '#/services/project-folder.js';
import { setProjectStatus } from '#/services/project-status.js';
import { projectConflict } from '#/services/project-conflict.js';
import { resolvePlacement, startRepository } from '#/services/project-placement.js';
import { assertBaseBranch, hostOf } from '#/services/project-host.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

/**
 * What the API shows of a project row; the deprecated tier-C column is left out.
 * `config_error` appears while the engine skips the project because its stored settings
 * no longer validate.
 */
function view(project: Project, configError?: string) {
  const { tier_c_globs: _deprecated, harness_defaults: _defaults, ...rest } = project;
  void _deprecated;
  void _defaults;

  return configError === undefined ? rest : { ...rest, config_error: configError };
}

async function create(
  deps: RouteDeps,
  ctx: Parameters<Route['handle']>[0],
): Promise<void> {
  const body = await readJson(ctx.req, ProjectCreateBody);
  assertProjectFolder(deps.dataHome, body.local_path);
  const placement = await resolvePlacement(body);

  // A fast refusal before the slow work; the decision that counts is made again inside the
  // transaction that saves the row, because two requests can both pass this read.
  const early = projectConflict(
    await deps.storage.transaction((tx) => tx.projects.list()),
    { ...body, local_path: placement.localPath },
  );

  if (early) {
    throw early;
  }

  const { host, repoFullName } = await hostOf(deps, body, placement);
  await assertBaseBranch(placement, host.base_branch);

  const { doc, settings } = settingsOf({ ...body.settings, git_host: host });

  const project: Project = {
    id: body.slug,
    slug: body.slug,
    prefix: body.prefix,
    local_path: placement.localPath,
    ...(placement.repoRoot ? { repo_root: placement.repoRoot } : {}),
    ...(placement.subfolder ? { subfolder: placement.subfolder } : {}),
    ...(body.connection_id ? { connection_id: body.connection_id } : {}),
    ...(repoFullName ? { repo_full_name: repoFullName } : {}),
    status: 'ready',
    // Detected here, from the folder itself: a client could lie or leave it out (d-0176).
    ecosystems: [
      ...(await detectProjectAt(placement.localPath, placement.repoRoot)).ecosystems,
    ],
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

  // The row goes in first so every read of the project's settings sees a registered slug,
  // and so the slug, prefix and folder are claimed before any slow side effect. The claim is
  // one transaction (the check and the save cannot be split by another request); the loser of
  // a race gets the same 409 as an ordinary duplicate. Settings are versioned append-only and
  // cannot be removed, so a failure after the row is saved is undone by deleting the row: the
  // slug, prefix and folder are free again, and the retry appends on top of whatever versions
  // the slug already has.
  const claimed = await deps.storage.transaction(async (tx) => {
    const conflict = projectConflict(await tx.projects.list(), project);
    if (!conflict) {
      await tx.projects.upsert(project);
    }

    return conflict;
  });

  if (claimed) {
    throw claimed;
  }

  let version: number;
  try {
    // Last before anything else is built: the user's folder is only touched once every
    // check above has passed and the project's slug, prefix and folder are ours.
    await startRepository(placement, host.base_branch);
    if (placement.setup?.mode === 'snapshot') {
      await assertBaseBranch({ ...placement, setup: null }, host.base_branch);
    }

    // The project's private memory repository is created with the project; a machine
    // without a usable git fails here and nothing stays saved.
    try {
      await deps.memory.init(body.slug);
    } catch (error) {
      throw new HttpError(
        500,
        'memory_init_failed',
        `could not create the project's memory repository: ${messageOf(error)}`,
        { family: 'crash' },
      );
    }

    version = await appendFirstSettings(deps, body, doc);
    await deps.projects.register(project, await deps.config.project(body.slug));
  } catch (error) {
    deps.projects.archive(body.slug);
    await deps.storage
      .transaction((tx) => tx.projects.delete(project.id))
      .catch(() => undefined);

    throw error;
  }

  sendJson(ctx.res, 201, { project: view(project), settings_version: version });
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
        const broken = deps.engine.unservableProjects();
        sendJson(res, 200, {
          projects: projects.map((p) => view(p, broken.get(p.slug))),
        });
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
        const { status } = await readJson(ctx.req, ProjectPatchBody);
        const updated = await setProjectStatus(deps, slug, status);

        sendJson(ctx.res, 200, { project: view(updated) });
      },
    },
  ];
}
