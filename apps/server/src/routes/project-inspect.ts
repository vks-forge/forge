/**
 * `POST /projects/inspect`: a dry run of registering a project on a folder.
 *
 * Why: the new-project form should tell the user a folder is wrong while they are still
 *   typing it, not after they filled in five more fields and pressed Create. This runs the
 *   same folder, uniqueness and repository checks as `POST /projects`, in the same order and
 *   with the same error codes (one door: the folder checks are shared code), and then, only
 *   if the folder is a usable clone, reports what the form can pre-fill: the branches and the
 *   checked-out one, the ecosystems and checks found at the repository root, and a slug and
 *   ticket prefix no other project uses. It never creates, writes or fetches anything, and it
 *   runs no command from the repository (detection reads file names and one manifest).
 *
 * Exports: projectInspectRoutes().
 * Depends on: @forge/core, @forge/git, @forge/gates, schemas/api, services/project-folder,
 *   services/project-conflict, services/http/*, types/routes. IO: reads storage and the clone.
 */

import { basename } from 'node:path';
import { suggestPrefix, suggestSlug } from '@forge/core';
import type { ProjectInspection } from '@forge/core';
import { detectProjectAt } from '@forge/gates';
import { inspectRepository, listBranches } from '@forge/git';
import { ProjectInspectBody } from '#/schemas/api.js';
import { readJson } from '#/services/http/body.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import { projectConflict } from '#/services/project-conflict.js';
import { assertProjectFolder } from '#/services/project-folder.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

/** `HEAD` resolves on any clone with a commit; it is how the repository is checked before a base branch is known. */
const PROBE_REF = 'HEAD';

export function projectInspectRoutes(deps: RouteDeps): Route[] {
  return [
    {
      method: 'POST',
      path: '/projects/inspect',
      async handle(ctx) {
        const body = await readJson(ctx.req, ProjectInspectBody);
        assertProjectFolder(deps.dataHome, body.local_path);

        const existing = await deps.storage.transaction((tx) => tx.projects.list());
        const conflict = projectConflict(existing, {
          slug: '',
          prefix: '',
          local_path: body.local_path,
        });

        // Only the folder clash applies here: the slug and prefix are suggestions, not input.
        if (conflict && conflict.code === 'path_in_use') {
          throw conflict;
        }

        const probe = await inspectRepository({
          path: body.local_path,
          baseBranch: body.base_branch ?? PROBE_REF,
        });

        if (!probe.ok) {
          const noCommits = probe.code === 'base_branch_missing' && !body.base_branch;

          throw new HttpError(
            400,
            probe.code,
            noCommits
              ? `${body.local_path} has no commits yet; make a first commit and try again`
              : probe.message,
          );
        }

        const listing = await listBranches({ path: body.local_path });
        const base = body.base_branch ?? listing.current ?? listing.branches[0] ?? 'main';

        if (base !== (body.base_branch ?? PROBE_REF)) {
          const checked = await inspectRepository({
            path: body.local_path,
            baseBranch: base,
          });

          if (!checked.ok) {
            throw new HttpError(400, checked.code, checked.message);
          }
        }

        const detected = await detectProjectAt(body.local_path);
        const slug = suggestSlug(
          basename(body.local_path),
          new Set(existing.map((p) => p.slug)),
        );

        const inspection: ProjectInspection = {
          local_path: body.local_path,
          current_branch: listing.current,
          base_branch: base,
          branches: [...listing.branches],
          branches_truncated: listing.truncated,
          ecosystems: [...detected.ecosystems],
          checks: [...detected.checks],
          suggested_slug: slug,
          suggested_prefix: suggestPrefix(slug, new Set(existing.map((p) => p.prefix))),
        };

        sendJson(ctx.res, 200, inspection);
      },
    },
  ];
}
