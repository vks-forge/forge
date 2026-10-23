/**
 * Picks the GitHost adapter a project's config names.
 *
 * Why: where branches are pushed and PRs live is per project (d-0062). `local_repo` is the
 *   project's own repository with no remote at all: verified work merges straight into its
 *   base branch (d-0124). `local` is a bare
 *   repository on disk (offline work, the end-to-end fixture); `github` is a GitHub App
 *   installation whose private key sits in the secret store. A project that was added
 *   through a GitHub connection has no App id or key name of its own: they come from the
 *   connection row (d-0094), so rotating or replacing the key touches one place. The key
 *   is fetched only when a token is needed and its bytes are handed straight to the
 *   adapter, never kept here or logged. The adapter is chosen by config, not by an `if` in
 *   the engine (code.md rule 2). A project with no `git_host` has no host: its tickets stop
 *   in Verifying instead of being published somewhere nobody chose.
 *
 * Exports: createProjectGitHost().
 * Depends on: node:path, @forge/core (GitHost, SecretStore, ProjectConfig, GithubConnection,
 *   AuthError, InvalidInputError), @forge/git. IO: through the adapters.
 */

import { resolve } from 'node:path';
import { AuthError, InvalidInputError } from '@forge/core';
import type { GitHost, GithubConnection, ProjectConfig, SecretStore } from '@forge/core';
import {
  createGitHubAppGitHost,
  createLocalBareGitHost,
  createLocalRepoGitHost,
} from '@forge/git';

/** The key name used by a `github` host that names neither a key nor a connection. */
const DEFAULT_KEY_SECRET = 'github-app-key';

/**
 * The host for `project`, or null when its config has no `git_host`. `root` is the project's
 * clone: a relative `remote_path` is resolved against it. `connection` is the project's
 * GitHub connection when it has one.
 */
export function createProjectGitHost(
  project: ProjectConfig,
  deps: {
    root: string;
    secrets: SecretStore;
    now: () => number;
    connection?: GithubConnection | null;
  },
): GitHost | null {
  const host = project.git_host;
  if (!host) {
    return null;
  }

  if (host.kind === 'local') {
    return createLocalBareGitHost({
      remotePath: resolve(deps.root, host.remote_path),
      baseBranch: host.base_branch,
      // The base is fetched into the project's own clone, where worktrees are cut from.
      localRepo: deps.root,
      now: deps.now,
    });
  }

  if (host.kind === 'local_repo') {
    return createLocalRepoGitHost({
      repoRoot: deps.root,
      baseBranch: host.base_branch,
      now: deps.now,
    });
  }

  const appId = deps.connection?.app_id ?? host.app_id;
  const keySecret =
    deps.connection?.key_secret_name ?? host.key_secret ?? DEFAULT_KEY_SECRET;

  if (!appId) {
    throw new InvalidInputError(
      `project ${project.slug} uses a GitHub host with no App id and no connection`,
    );
  }

  if (deps.connection && deps.connection.status !== 'active') {
    throw new InvalidInputError(
      `GitHub connection ${deps.connection.id} is ${deps.connection.status}`,
    );
  }

  return createGitHubAppGitHost({
    owner: host.owner,
    repo: host.repo,
    baseBranch: host.base_branch,
    appId,
    installationId: host.installation_id,
    localRepo: deps.root,
    now: deps.now,
    privateKey: async () => {
      const key = await deps.secrets.get(keySecret);
      if (!key) {
        throw new AuthError(
          `GitHub App key "${keySecret}" is not in the secret store; add the connection's private key again`,
        );
      }

      return key;
    },
  });
}
