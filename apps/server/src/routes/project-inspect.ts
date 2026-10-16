/**
 * `POST /projects/inspect`: a dry run of registering a project on a folder.
 *
 * Why: the new-project form should tell the user a folder is wrong while they are still
 *   choosing it, not after they filled in five more fields and pressed Create. The checks and
 *   the answer (git state, snapshot size, branches, ecosystems, checks, a free slug and
 *   prefix) are built by `services/project-inspect`, the same code path registration relies
 *   on; this route only parses the body and sends the result. It never creates, writes or
 *   fetches anything.
 *
 * Exports: projectInspectRoutes().
 * Depends on: schemas/api, services/project-inspect, services/http/*, types/routes. IO: reads storage and the folder.
 */

import { ProjectInspectBody } from '#/schemas/api.js';
import { readJson } from '#/services/http/body.js';
import { sendJson } from '#/services/http/respond.js';
import { inspectProject } from '#/services/project-inspect.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

export function projectInspectRoutes(deps: RouteDeps): Route[] {
  return [
    {
      method: 'POST',
      path: '/projects/inspect',
      async handle(ctx) {
        const body = await readJson(ctx.req, ProjectInspectBody);
        sendJson(ctx.res, 200, await inspectProject(deps, body));
      },
    },
  ];
}
