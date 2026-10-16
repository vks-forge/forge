/**
 * The `http` side of first run and new project: `/system`, `/projects/inspect`, `POST /projects`, and `/fs/folders` (list, create), `/fs/pick-folder` and `/fs/reveal`.
 *
 * Why: these calls decide whether the wizard shows, whether a typed folder is a usable
 *   clone and whether the project is registered, so each must hit the exact route the server
 *   implements and parse the answer with the schemas from `@forge/core` that the server builds
 *   it from. This is the only place that knows the paths. Nothing here carries the install
 *   token or any credential: the page sends none (d-0093).
 *
 * Exports: createOnboardingHttp().
 * Depends on: @forge/core (SystemInfo, ProjectInspection, FolderListing, FolderEntry, FolderPick, FolderReveal), api/http/request-json,
 *   schemas/projects, types/api.types, types/onboarding.types.
 */

import {
  FolderEntry,
  FolderListing,
  FolderPick,
  FolderReveal,
  ProjectInspection,
  SystemInfo,
} from '@forge/core';
import { requestJson } from '#/api/http/request-json.js';
import { ProjectCreated } from '#/schemas/projects.js';
import type { HttpClientOptions } from '#/types/api.types.js';
import type { OnboardingApi } from '#/types/onboarding.types.js';

export function createOnboardingHttp(client: HttpClientOptions): OnboardingApi {
  return {
    system: (options) => requestJson(client, '/system', SystemInfo, options),
    inspect: (body, options) =>
      requestJson(client, '/projects/inspect', ProjectInspection, {
        ...options,
        method: 'POST',
        body,
      }),
    listFolders: (path, options) =>
      requestJson(
        client,
        `/fs/folders${path ? `?path=${encodeURIComponent(path)}` : ''}`,
        FolderListing,
        options,
      ),
    pickFolder: (start, options) =>
      requestJson(client, '/fs/pick-folder', FolderPick, {
        ...options,
        method: 'POST',
        body: start ? { start } : {},
      }),
    createFolder: (body, options) =>
      requestJson(client, '/fs/folders', FolderEntry, {
        ...options,
        method: 'POST',
        body,
      }),
    revealFolder: (path, options) =>
      requestJson(client, '/fs/reveal', FolderReveal, {
        ...options,
        method: 'POST',
        body: { path },
      }),
    createProject: (body) =>
      requestJson(client, '/projects', ProjectCreated, { method: 'POST', body }),
  };
}
