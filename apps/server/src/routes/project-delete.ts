/**
 * Delete project: `DELETE /projects/:slug`.
 *
 * Why: archiving retires a project but keeps its slug, prefix and folder claimed, so a
 *   user who added the wrong folder or wants a clean start has no way back. Delete is that
 *   way: it removes the project from Forge so the same folder can be added again. It is
 *   destructive, so the body must repeat the slug (the UI makes the user type it; the server
 *   checks it too so a stray call cannot delete), and it is refused while any run of the
 *   project is still working, because removing a ticket under a live Worker would leave the
 *   Worker writing into a worktree no ticket owns. The database rows go in one
 *   transaction together with the busy check; only then does the registry stop serving the
 *   project and the memory repository and worktrees are removed from the data home. The
 *   folder the user registered (`local_path`) is never touched, and neither are the
 *   settings versions, which are append-only by design (a re-added slug continues them).
 *   A folder that stays locked after the rows are gone is reported in `leftovers`, not
 *   turned into an error that would hide a delete that already happened.
 *
 * Exports: projectDeleteRoutes().
 * Depends on: schemas/api, services/find-project, services/project-files, services/http/*,
 *   types/routes. IO: storage, deletes folders under the data home.
 */

import { ProjectDeleteBody } from '#/schemas/api.js';
import { findProject } from '#/services/find-project.js';
import { readJson } from '#/services/http/body.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import { removeProjectFiles } from '#/services/project-files.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

/** Runs in these states may still act or are being settled; the project cannot go away under them. */
const BUSY_RUN_STATUSES = ['starting', 'running', 'settling'] as const;

export function projectDeleteRoutes(deps: RouteDeps): Route[] {
  return [
    {
      method: 'DELETE',
      path: '/projects/:slug',
      async handle(ctx) {
        const slug = ctx.params['slug'] ?? '';
        const body = await readJson(ctx.req, ProjectDeleteBody);

        await deps.storage.transaction(async (tx) => {
          await findProject(tx, slug);

          if (body.confirm !== slug) {
            throw new HttpError(
              400,
              'confirm_mismatch',
              `type the project slug "${slug}" to confirm`,
            );
          }

          const busy = await tx.runs.list({
            project: slug,
            statuses: BUSY_RUN_STATUSES,
            limit: 1,
          });

          if (busy.length > 0) {
            throw new HttpError(
              409,
              'project_busy',
              `project ${slug} has work running; stop it first`,
              { family: 'stall' },
            );
          }

          await tx.projects.purge(slug);
        });

        deps.projects.archive(slug);
        const leftovers = await removeProjectFiles(deps.dataHome, slug);

        sendJson(ctx.res, 200, {
          deleted: slug,
          ...(leftovers.length > 0 ? { leftovers } : {}),
        });
      },
    },
  ];
}
