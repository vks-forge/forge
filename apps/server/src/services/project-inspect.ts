/**
 * Builds the `ProjectInspection` for a folder: what Forge found and what the form can pre-fill.
 *
 * Why: the new-project form should tell the user a folder is wrong, and what git will have to
 *   do for it, while they are still choosing it, not after they filled in five more steps
 *   (d-0124). This runs the same folder and uniqueness checks as `POST /projects` (one door:
 *   the folder checks are shared code), looks at the folder with git (its own repository, no
 *   repository, or inside another one), and reports the branches, ecosystems and checks the
 *   next steps need. A folder with no git reports what a snapshot commit would take in; a
 *   folder inside a repository reports the repository top and its own subfolder, with
 *   checks detected from the subfolder. It never creates, writes or fetches anything, and
 *   it runs no command from the folder (detection reads file names and one manifest).
 *
 * Exports: inspectProject().
 * Depends on: node:path, @forge/core, @forge/git, @forge/gates, schemas/api, services/project-folder,
 *   services/project-conflict, services/http/http-errors. IO: reads storage and the folder.
 */

import { basename } from 'node:path';
import { suggestPrefix, suggestSlug } from '@forge/core';
import type { ProjectInspection, StorageAdapter } from '@forge/core';
import { detectProjectAt } from '@forge/gates';
import {
  inspectFolderGit,
  inspectRepository,
  listBranches,
  scanSnapshot,
} from '@forge/git';
import type { ProjectInspectBody } from '#/schemas/api.js';
import { HttpError } from '#/services/http/http-errors.js';
import { projectConflict } from '#/services/project-conflict.js';
import { assertProjectFolder } from '#/services/project-folder.js';

/** The base branch a project with no repository (or an empty one) starts on. */
export const DEFAULT_BASE_BRANCH = 'main';

export async function inspectProject(
  deps: {
    dataHome: { readonly home: string; readonly worktreesDir: string };
    storage: StorageAdapter;
  },
  body: ProjectInspectBody,
): Promise<ProjectInspection> {
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

  const git = await inspectFolderGit({ path: body.local_path });
  const top = git.repo_root;
  const listing =
    top === null
      ? { current: null, branches: [] as string[], truncated: false }
      : await listBranches({ path: top });

  const base =
    body.base_branch ?? listing.current ?? listing.branches[0] ?? DEFAULT_BASE_BRANCH;

  // With a commit, the base must exist; an empty repository has nothing to check yet.
  if (top !== null && (git.has_commits || body.base_branch)) {
    const checked = await inspectRepository({ path: top, baseBranch: base });
    if (!checked.ok) {
      throw new HttpError(400, checked.code, checked.message);
    }
  }

  const detected = await detectProjectAt(body.local_path, top ?? undefined);
  const slug = suggestSlug(
    basename(body.local_path),
    new Set(existing.map((p) => p.slug)),
  );

  return {
    local_path: body.local_path,
    current_branch: listing.current,
    base_branch: base,
    branches: [...listing.branches],
    branches_truncated: listing.truncated,
    ecosystems: [...detected.ecosystems],
    checks: [...detected.checks],
    setup: [...detected.setup],
    suggested_slug: slug,
    suggested_prefix: suggestPrefix(slug, new Set(existing.map((p) => p.prefix))),
    git,
    snapshot: git.state === 'none' ? await scanSnapshot({ path: body.local_path }) : null,
  };
}
