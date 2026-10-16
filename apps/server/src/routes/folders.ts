/**
 * `GET /fs/folders`, `POST /fs/folders`, `POST /fs/reveal`: the folder browser behind "Browse…".
 *
 * Why: a browser page cannot learn the absolute path of a folder from a file picker, but a
 *   project is registered by the absolute path of its folder. Forge runs on the person's own
 *   machine, so these routes let the page walk the disk: with no `path`, the places to start
 *   from (home folder and drives); with one, its sub-folders (name, repository mark, modified
 *   time). Listing returns folder names only (never file names or contents). The two writes
 *   are deliberately small: make one folder, and show one folder in the file manager; there is
 *   no rename and no delete. Both are POSTs so they pass the same token and Origin checks as
 *   every unsafe route; a page on another site must never create folders or open windows here.
 *
 * Exports: folderRoutes().
 * Depends on: @forge/core (FolderCreateBody, FolderRevealBody), services/{folder-listing,folder-create},
 *   services/http/{body,http-errors,respond}, types/{http,routes}.
 *   IO: reads folder names; creates one folder; opens the file manager via the injected revealer.
 */

import { isAbsolute } from 'node:path';
import { FolderCreateBody, FolderRevealBody } from '@forge/core';
import { createFolder } from '#/services/folder-create.js';
import { listFolders, listRoots } from '#/services/folder-listing.js';
import { readJson } from '#/services/http/body.js';
import { HttpError } from '#/services/http/http-errors.js';
import { sendJson } from '#/services/http/respond.js';
import type { Route } from '#/types/http.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

export function folderRoutes(deps: RouteDeps): Route[] {
  return [
    {
      method: 'GET',
      path: '/fs/folders',
      async handle({ res, url }) {
        const path = url.searchParams.get('path') ?? '';

        if (path === '') {
          sendJson(res, 200, await listRoots());

          return;
        }

        if (!isAbsolute(path)) {
          throw new HttpError(
            400,
            'invalid_path',
            'path must be an absolute folder path',
          );
        }

        sendJson(res, 200, await listFolders(path));
      },
    },
    {
      method: 'POST',
      path: '/fs/folders',
      async handle({ req, res }) {
        const body = await readJson(req, FolderCreateBody);

        sendJson(res, 201, await createFolder(body.parent, body.name));
      },
    },
    {
      method: 'POST',
      path: '/fs/reveal',
      async handle({ req, res }) {
        const body = await readJson(req, FolderRevealBody);

        if (!deps.folderRevealer) {
          sendJson(res, 200, {
            status: 'unavailable',
            reason: 'this server cannot open a file manager',
          });

          return;
        }

        sendJson(res, 200, await deps.folderRevealer.reveal(body.path));
      },
    },
  ];
}
