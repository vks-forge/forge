/**
 * Picks the GitHost adapter a project's config names.
 *
 * Why: where branches are pushed and PRs live is per project (d-0062). `local` is a bare
 *   repository on disk (offline work, the end-to-end fixture); `github` is a GitHub App
 *   installation whose private key sits in the DPAPI secret store under the configured name.
 *   The key is fetched only when a token is needed and its bytes are handed straight to the
 *   adapter, never kept here or logged. The adapter is chosen by config, not by an `if` in
 *   the engine (code.md rule 2). A project with no `git_host` has no host: its tickets stop
 *   in Verifying instead of being published somewhere nobody chose.
 *
 * Exports: createProjectGitHost().
 * Depends on: node:path, @forge/core (GitHost, SecretStore, ProjectConfig, AuthError),
 *   @forge/git. IO: through the adapters.
 */

import { resolve } from 'node:path';
import { AuthError } from '@forge/core';
import type { GitHost, ProjectConfig, SecretStore } from '@forge/core';
import { createGitHubAppGitHost, createLocalBareGitHost } from '@forge/git';

/** The host for `project`, or null when its config has no `git_host`. */
export function createProjectGitHost(
  project: ProjectConfig,
  deps: { root: string; secrets: SecretStore; now: () => number },
): GitHost | null {
  const host = project.git_host;
  if (!host) {
    return null;
  }

  if (host.kind === 'local') {
    return createLocalBareGitHost({
      remotePath: resolve(deps.root, host.remote_path),
      baseBranch: host.base_branch,
      now: deps.now,
    });
  }

  return createGitHubAppGitHost({
    owner: host.owner,
    repo: host.repo,
    baseBranch: host.base_branch,
    appId: host.app_id,
    installationId: host.installation_id,
    now: deps.now,
    privateKey: async () => {
      const key = await deps.secrets.get(host.key_secret);
      if (!key) {
        throw new AuthError(
          `GitHub App key "${host.key_secret}" is not in the secret store; wrap it with "forge secret wrap"`,
        );
      }

      return key;
    },
  });
}
