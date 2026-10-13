/**
 * GitHub App implementation of the GitHost port.
 *
 * Why: real projects live on GitHub, and a Worker must never hold credentials (d-0012).
 *   The server authenticates as a GitHub App installation: a JWT signed with the App key
 *   becomes a short-lived installation token, used for REST calls (open, read, merge,
 *   close PRs, delete branches) and, through environment-only git config, for `git push`.
 *   The token is never put in argv, the remote URL, a git config file or an error message,
 *   so nothing a log or process listing shows can be replayed. Failures are typed
 *   `GitHostError`s the engine branches on (d-0062).
 *
 * Exports: createGitHubAppGitHost().
 * Depends on: zod, @forge/core, adapters/git-cli/run-git, adapters/github-app/{rest-client,
 *   installation-token}, domain/{push-env,ref-check}, shared/host-errors.
 *   IO: HTTPS to the GitHub API, `git push` to github.com.
 */

import type { GitHost, PrState } from '@forge/core';
import { z } from 'zod';
import { createGitRunner } from '#/adapters/git-cli/run-git.js';
import { createTokenSource } from '#/adapters/github-app/installation-token.js';
import { createRestClient } from '#/adapters/github-app/rest-client.js';
import { buildPushEnv, redactSecrets } from '#/domain/push-env.js';
import { assertSafeRefArg } from '#/domain/ref-check.js';
import { GitHostError } from '#/shared/host-errors.js';
import type { GitHubAppGitHostOptions } from '#/types/git-host.types.js';

const PullResponse = z.object({
  number: z.number().int().positive(),
  html_url: z.string().min(1),
  state: z.enum(['open', 'closed']),
  merged: z.boolean().optional(),
  mergeable: z.boolean().nullable().optional(),
  head: z.object({ sha: z.string().min(1) }),
});

const MergeResponse = z.object({ sha: z.string().min(1) });

const parse = <T>(schema: z.ZodType<T>, json: unknown, what: string): T => {
  const r = schema.safeParse(json);
  if (!r.success) {
    throw new GitHostError('unavailable', `GitHub returned an unreadable ${what}`);
  }

  return r.data;
};

/** Creates a GitHost that acts as a GitHub App installation on `owner/repo`. */
export function createGitHubAppGitHost(o: GitHubAppGitHostOptions): GitHost {
  const rest = createRestClient(o.apiBase ?? 'https://api.github.com', o.fetch ?? fetch);
  const git = o.git ?? createGitRunner('git');
  const now = o.now ?? Date.now;
  const tokens = createTokenSource({
    rest,
    appId: o.appId,
    installationId: o.installationId,
    privateKey: o.privateKey,
    now,
  });

  const repoPath = `/repos/${encodeURIComponent(o.owner)}/${encodeURIComponent(o.repo)}`;
  const gitBase = (o.gitBase ?? 'https://github.com').replace(/\/+$/, '');
  const encodeRef = (branch: string): string =>
    branch.split('/').map(encodeURIComponent).join('/');

  const api = async (
    method: string,
    path: string,
    body?: unknown,
    accept?: readonly number[],
  ) =>
    rest.call(await tokens.token(), method, `${repoPath}${path}`, {
      ...(body === undefined ? {} : { body }),
      ...(accept === undefined ? {} : { accept }),
    });

  return {
    async push(worktreePath, branch) {
      assertSafeRefArg('branch', branch);
      const token = await tokens.token();
      try {
        await git.run(
          worktreePath,
          ['push', `${gitBase}/${o.owner}/${o.repo}.git`, `${branch}:${branch}`],
          { env: buildPushEnv(token) },
        );
      } catch (cause) {
        // git's stderr can echo the request; scrub before the message leaves this function.
        const why = cause instanceof Error ? cause.message : String(cause);
        throw new GitHostError('unavailable', redactSecrets(why, [token]));
      }
    },

    async openPr({ branch, base, title, body }) {
      const { json } = await api('POST', '/pulls', { title, head: branch, base, body });
      const pr = parse(PullResponse, json, 'pull request');

      return { number: pr.number, url: pr.html_url };
    },

    async prStatus(n) {
      const { json } = await api('GET', `/pulls/${n}`);
      const pr = parse(PullResponse, json, 'pull request');
      const state: PrState = pr.merged === true ? 'merged' : pr.state;

      return { state, mergeable: pr.mergeable ?? null, headSha: pr.head.sha };
    },

    async merge(n, method) {
      const { json } = await api('PUT', `/pulls/${n}/merge`, { merge_method: method });

      return { sha: parse(MergeResponse, json, 'merge response').sha };
    },

    async closePr(n) {
      await api('PATCH', `/pulls/${n}`, { state: 'closed' });
    },

    async deleteBranch(branch) {
      assertSafeRefArg('branch', branch);
      if (branch === o.baseBranch) {
        throw new GitHostError('invalid', `refusing to delete the base branch ${branch}`);
      }

      // 404 and 422 both mean the ref is already gone, so a repeat delete is not an error.
      await api(
        'DELETE',
        `/git/refs/heads/${encodeRef(branch)}`,
        undefined,
        [204, 404, 422],
      );
    },
  };
}
