/**
 * Picks the git host settings of a new project and checks its base branch.
 *
 * Why: a project reaches git in one of three ways, chosen at registration: a full `git_host`
 *   given by the caller (the bare-repo host), a GitHub App connection, or neither, which
 *   means no remote at all and verified work merging into the project's own repository
 *   (d-0124). Keeping the choice in one place means the route never branches on host kind.
 *   The base branch must exist once the repository has a commit; a folder whose repository
 *   is not started yet, or is empty, has nothing to check and its work waits for the first
 *   commit.
 *
 * Exports: hostOf(), assertBaseBranch().
 * Depends on: @forge/core, @forge/git, schemas/api, services/http/http-errors,
 *   services/project-inspect, types/project-placement, types/routes. IO: storage, git.
 */

import type { GitHostConfig } from '@forge/core';
import { inspectRepository, listBranches } from '@forge/git';
import type { ProjectCreateBody } from '#/schemas/api.js';
import { HttpError } from '#/services/http/http-errors.js';
import { DEFAULT_BASE_BRANCH } from '#/services/project-inspect.js';
import type { Placement } from '#/types/project-placement.types.js';
import type { RouteDeps } from '#/types/routes.types.js';

/** The `git_host` settings of a new project, from either way of naming it. */
export async function hostOf(
  deps: RouteDeps,
  body: ProjectCreateBody,
  placement: Placement,
): Promise<{ host: GitHostConfig; repoFullName?: string }> {
  if (!body.git_host && !body.connection_id) {
    // No remote to publish to: verified work merges into the project's own repository (d-0124).
    const top = placement.repoRoot ?? placement.localPath;
    const current =
      placement.git.state === 'none' ? null : (await listBranches({ path: top })).current;

    return {
      host: {
        kind: 'local_repo',
        base_branch: body.base_branch ?? current ?? DEFAULT_BASE_BRANCH,
      },
    };
  }

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

/** Refuses a base branch the repository does not have (once it has a commit). */
export async function assertBaseBranch(
  placement: Placement,
  baseBranch: string,
): Promise<void> {
  if (placement.setup || (placement.git.state !== 'none' && !placement.git.has_commits)) {
    return;
  }

  const inspected = await inspectRepository({
    path: placement.repoRoot ?? placement.localPath,
    baseBranch,
  });

  if (!inspected.ok) {
    throw new HttpError(400, inspected.code, inspected.message);
  }
}
