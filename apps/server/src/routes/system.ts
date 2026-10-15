/**
 * `GET /system`: what the UI needs to decide whether to show the first-run wizard.
 *
 * Why: a person who has just installed Forge opens the app and must land on setup, not on
 *   an empty project list; a returning user must never see setup again. The browser cannot
 *   read Forge's files, so the server says where its data folder is (the wizard's first step
 *   explains it), which version runs, and whether setup is finished. "Finished" is derived,
 *   not stored: it means at least one project is registered, which is exactly what the wizard
 *   produces, so there is no flag to fall out of step with the database and a fresh data
 *   home shows the wizard again by itself. Whether a harness has passed its test is reported
 *   too, so an interrupted wizard resumes at the right step. The answer holds no token, key
 *   or credential, and the route needs the install token like every route except `/health`.
 *
 * Exports: systemRoutes().
 * Depends on: @forge/core (SystemInfo), config/version, services/http/respond, types/routes.
 *   IO: reads storage; the version once from package.json.
 */

import type { SystemInfo } from '@forge/core';
import { readServerVersion } from '#/config/version.js';
import { sendJson } from '#/services/http/respond.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

export function systemRoutes(deps: RouteDeps): Route[] {
  let version: Promise<string> | null = null;

  return [
    {
      method: 'GET',
      path: '/system',
      async handle({ res }) {
        version ??= readServerVersion();
        const { projectCount, harnessOk } = await deps.storage.transaction(
          async (tx) => ({
            projectCount: (await tx.projects.list()).length,
            harnessOk: (await tx.harnesses.list()).some((h) => h.status === 'ok'),
          }),
        );

        const info: SystemInfo = {
          service: 'forge',
          version: await version,
          data_home: deps.dataHome.home,
          first_run: {
            complete: projectCount > 0,
            project_count: projectCount,
            harness_ok: harnessOk,
          },
        };

        sendJson(res, 200, info);
      },
    },
  ];
}
