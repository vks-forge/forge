/**
 * GitHub App implementation of the GitHost port.
 *
 * Why: real projects live on GitHub, and a Worker must never hold credentials (d-0012).
 *   The server authenticates as a GitHub App installation: a JWT signed with the App key
 *   becomes a short-lived installation token, used for REST calls (open, read, merge,
 *   close PRs, delete branches) and, through environment-only git config, for `git push`.
 *   The token is never put in argv, the remote URL, a git config file or an error message,
 *   so nothing a log or process listing shows can be replayed. A 401 (or a 403 that is not a
 *   quota) drops the cached token and retries the call once with a fresh one. Merges are
 *   pinned to the judged head sha: GitHub's `sha` check turns a moved head into a
 *   `HeadMovedError`, a base that moved a moment ago into a retryable `merge_busy`. Failures
 *   are typed `GitHostError`s the engine branches on (d-0062).
 *
 * Exports: createGitHubAppGitHost() (a GitHost plus gitAuthEnv() for fetches and ls-remote).
 * Depends on: zod, @forge/core, adapters/git-cli/run-git, adapters/github-app/{rest-client,
 *   installation-token}, domain/{push-env,ref-check}, schemas/github-responses, shared/host-errors.
 *   IO: HTTPS to the GitHub API, `git push` to github.com.
 */

import { HeadMovedError } from '@forge/core';
import type { PrState } from '@forge/core';
import { z } from 'zod';
import { createGitRunner } from '#/adapters/git-cli/run-git.js';
import { createTokenSource } from '#/adapters/github-app/installation-token.js';
import { createRestClient } from '#/adapters/github-app/rest-client.js';
import { buildPushEnv, redactSecrets } from '#/domain/push-env.js';
import { assertSafeRefArg } from '#/domain/ref-check.js';
import { MergeResponse, PullResponse } from '#/schemas/github-responses.js';
import { GitHostError, refineMergeRefusal } from '#/shared/host-errors.js';
import type {
  GitHubAppGitHost,
  GitHubAppGitHostOptions,
} from '#/types/git-host.types.js';

const parse = <T>(schema: z.ZodType<T>, json: unknown, what: string): T => {
  const r = schema.safeParse(json);
  if (!r.success) {
    throw new GitHostError('unavailable', `GitHub returned an unreadable ${what}`);
  }

  return r.data;
};

/** Creates a GitHost that acts as a GitHub App installation on `owner/repo`. */
export function createGitHubAppGitHost(o: GitHubAppGitHostOptions): GitHubAppGitHost {
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
  ) => {
    const call = (token: string) =>
      rest.call(token, method, `${repoPath}${path}`, {
        ...(body === undefined ? {} : { body }),
        ...(accept === undefined ? {} : { accept }),
      });

    const token = await tokens.token();
    try {
      return await call(token);
    } catch (e) {
      // 401, or a 403 that is not a quota, can mean the cached token was revoked or the App
      // was reinstalled while it was still inside its hour. Mint a new one and retry the
      // call once; a second refusal is a real auth problem for the user.
      if (!(e instanceof GitHostError) || e.reason !== 'auth' || e.status === undefined) {
        throw e;
      }

      tokens.invalidate(token);

      return call(await tokens.token());
    }
  };

  return {
    async gitAuthEnv() {
      return buildPushEnv(await tokens.token(), gitBase);
    },

    async push(worktreePath, branch) {
      assertSafeRefArg('branch', branch);
      const token = await tokens.token();
      try {
        await git.run(
          worktreePath,
          ['push', `${gitBase}/${o.owner}/${o.repo}.git`, `${branch}:${branch}`],
          { env: buildPushEnv(token, gitBase) },
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

    async findPr(branch) {
      assertSafeRefArg('branch', branch);
      const head = encodeURIComponent(`${o.owner}:${branch}`);
      const { json } = await api('GET', `/pulls?head=${head}&state=open`);
      const list = parse(z.array(PullResponse), json, 'pull request list');
      const pr = list[0];

      return pr ? { number: pr.number, url: pr.html_url } : null;
    },

    async prStatus(n) {
      const { json } = await api('GET', `/pulls/${n}`);
      const pr = parse(PullResponse, json, 'pull request');
      const state: PrState = pr.merged === true ? 'merged' : pr.state;

      return { state, mergeable: pr.mergeable ?? null, headSha: pr.head.sha };
    },

    async merge(n, method, expectedHeadSha) {
      try {
        // `sha` makes GitHub refuse (409) when the head is not the commit the gates judged.
        const { json } = await api('PUT', `/pulls/${n}/merge`, {
          merge_method: method,
          sha: expectedHeadSha,
        });

        return { sha: parse(MergeResponse, json, 'merge response').sha };
      } catch (e) {
        if (!(e instanceof GitHostError) || e.reason !== 'merge_refused') {
          throw e;
        }

        const kind = refineMergeRefusal(e.message);
        if (kind === 'head_moved') {
          throw new HeadMovedError(`PR ${n} head moved: ${e.message}`, { cause: e });
        }

        if (kind === 'merge_busy') {
          throw new GitHostError('merge_busy', e.message, e.status);
        }

        throw e;
      }
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
