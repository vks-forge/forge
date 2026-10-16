/**
 * `POST /fs/pick-folder`: opens the system folder window on this computer and answers the choice.
 *
 * Why: a web page cannot read the absolute path of a folder from a file picker, but a project
 *   is registered by that path. Forge runs on the person's own desktop, so the server opens
 *   the OS folder window (Explorer, Finder, zenity) and returns the path. It is a POST
 *   because it opens a window and so must pass the same token and Origin checks as every
 *   other action; a web page on another site must never be able to pop windows on the
 *   desktop. "Unavailable" is an ordinary 200 so the page falls back to its own browser.
 *
 * Exports: folderPickRoute().
 * Depends on: @forge/core (FolderPickBody), services/http/{body,respond}, types/routes.
 *   IO: opens a window via the injected picker.
 */

import { FolderPickBody } from '@forge/core';
import { readJson } from '#/services/http/body.js';
import { sendJson } from '#/services/http/respond.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

export function folderPickRoute(deps: RouteDeps): Route {
  return {
    method: 'POST',
    path: '/fs/pick-folder',
    async handle({ req, res }) {
      const body = await readJson(req, FolderPickBody);

      if (!deps.folderPicker) {
        sendJson(res, 200, {
          status: 'unavailable',
          reason: 'this server cannot show a folder window',
        });

        return;
      }

      sendJson(res, 200, await deps.folderPicker.pick(body.start));
    },
  };
}
