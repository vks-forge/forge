/**
 * Probe 9: the GitHub App host against the real repository (writes to GitHub, gated).
 *
 * Why: the fake GitHub server proves the wire format we expect, not that GitHub accepts the
 * App JWT, that the installation holds contents:write and pull_requests:write, that the
 * env-only push header authenticates a real `git push`, or that the REST responses match our
 * strict schemas. Only a real round trip shows the Director can open and close a PR without a
 * Worker ever holding a credential (d-0062). The branch is cut from GitHub's own base branch in
 * a scratch repo, so unpushed local commits can never be published by accident, and nothing is
 * merged. Cleanup (close PR, delete branch, remove scratch dir) runs even when a step fails.
 *
 * Pins: token mint, fetch, push, findPr null then found, open status with the pushed head sha,
 *   close, delete branch, branch gone on the remote, and no token or JWT in any error or artefact.
 * Depends on: src/index, @forge/secrets (DPAPI store, key `github-app-key`), helpers/probe-env.
 *   IO: HTTPS to github.com and api.github.com, writes under .forge/data/probes/9/.
 */

import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDpapiSecretStore } from '@forge/secrets';
import { describe, expect, it } from 'vitest';
import { createGitHubAppGitHost } from '#/index.js';
import {
  findSecretLeaks,
  freshProbeDir,
  gitIn,
  probeConfig,
  REPO_ROOT,
  scrubSecrets,
  SKIP_REASON,
  tokenFromAuthEnv,
} from '#tests/helpers/probe-env.js';

const config = probeConfig();
const probe = it.skipIf(config === null);

describe('probe 9: GitHub App host on the real repository', () => {
  probe(
    `push, open, read, close, delete a throwaway branch ${SKIP_REASON}`,
    async () => {
      if (config === null) {
        return;
      }

      const out = freshProbeDir('9');
      const stamp = Date.now();
      const branch = `probe/forge-probe9-${stamp}`;
      const remote = `https://github.com/${config.owner}/${config.repo}.git`;
      const scratch = mkdtempSync(join(tmpdir(), 'forge-probe9-'));
      const secrets: string[] = [];
      const errors: string[] = [];
      const timings: Record<string, number> = {};
      const results: Record<string, string> = {};
      const states: string[] = [];
      const summary: Record<string, unknown> = { branch };
      let prNumber: number | null = null;
      let prOpen = false;
      let pushed = false;

      const store = createDpapiSecretStore({
        dir: join(REPO_ROOT, '.forge', 'data', 'secrets'),
      });

      const host = createGitHubAppGitHost({
        owner: config.owner,
        repo: config.repo,
        baseBranch: config.base,
        appId: config.appId,
        installationId: config.installationId,
        privateKey: async () => {
          const key = await store.get('github-app-key');
          if (key === null) {
            throw new Error('secret github-app-key is not stored in .forge/data/secrets');
          }

          return key;
        },
      });

      /** Times a step, records its outcome, and rethrows failures with secrets scrubbed. */
      const step = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
        const t0 = Date.now();
        try {
          const result = await run();
          results[name] = 'ok';

          return result;
        } catch (e) {
          const msg = scrubSecrets(e instanceof Error ? e.message : String(e), secrets);
          errors.push(`${name}: ${msg}`);
          results[name] = `failed: ${msg}`;
          throw new Error(`${name}: ${msg}`);
        } finally {
          timings[name] = Date.now() - t0;
        }
      };

      try {
        const authEnv = await step('mint-token', () => host.gitAuthEnv());
        secrets.push(tokenFromAuthEnv(authEnv));
        const git = (args: string[], withAuth = false) =>
          gitIn(scratch, args, { ...(withAuth ? { env: authEnv } : {}), secrets });

        await step('prepare-worktree', async () => {
          await git(['init', '-q']);
          await git(
            ['fetch', '-q', '--depth', '1', remote, `refs/heads/${config.base}`],
            true,
          );

          await git(['checkout', '-q', '-b', branch, 'FETCH_HEAD']);
          mkdirSync(join(scratch, '.forge-probe'));
          writeFileSync(
            join(scratch, '.forge-probe', `probe9-${stamp}.md`),
            'This branch is a Forge live probe (probe 9). It is deleted automatically.\n',
          );

          await git(['add', '--all']);
          await git([
            '-c',
            'user.name=Forge',
            '-c',
            'user.email=forge@localhost',
            '-c',
            'commit.gpgsign=false',
            'commit',
            '-q',
            '--no-verify',
            '-m',
            'chore: Forge probe 9 (temporary)',
          ]);
        });

        const localSha = (await git(['rev-parse', 'HEAD'])).trim();

        await step('push', async () => {
          pushed = true;
          await host.push(scratch, branch);
        });

        expect(await step('find-before-open', () => host.findPr(branch))).toBeNull();
        const pr = await step('open-pr', () =>
          host.openPr({
            branch,
            base: config.base,
            title: 'Forge probe 9 (auto-closed)',
            body: 'Live probe of the Forge GitHub App host. Closed and deleted automatically; never merged.',
          }),
        );

        prNumber = pr.number;
        prOpen = true;
        const found = await step('find-after-open', () => host.findPr(branch));
        expect(found?.number).toBe(pr.number);

        const open = await step('status-open', () => host.prStatus(pr.number));
        states.push(open.state);
        expect(open.state).toBe('open');
        expect(open.headSha).toBe(localSha);

        await step('close-pr', () => host.closePr(pr.number));
        prOpen = false;
        const closed = await step('status-closed', () => host.prStatus(pr.number));
        states.push(closed.state);
        expect(closed.state).toBe('closed');

        await step('delete-branch', () => host.deleteBranch(branch));
        pushed = false;
        const remaining = await step('branch-gone', () =>
          git(['ls-remote', '--heads', remote, `refs/heads/${branch}`], true),
        );

        expect(remaining.trim()).toBe('');
        summary['headSha'] = localSha;
        summary['pr'] = { number: pr.number, url: pr.url };
      } finally {
        // Best-effort cleanup; failures are recorded but must not mask the real error.
        if (prNumber !== null && prOpen) {
          await host
            .closePr(prNumber)
            .catch((e: unknown) => errors.push(`cleanup-close: ${String(e)}`));
        }

        if (pushed) {
          await host
            .deleteBranch(branch)
            .catch((e: unknown) => errors.push(`cleanup-delete: ${String(e)}`));
        }

        rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
        summary['steps'] = results;
        summary['timingsMs'] = timings;
        summary['statesSeen'] = states;
        summary['errors'] = errors.map((m) => scrubSecrets(m, secrets));
        writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
      }

      const artefacts = readdirSync(out).map((f) => readFileSync(join(out, f), 'utf8'));
      for (const text of [...errors, ...artefacts]) {
        expect(findSecretLeaks(text, secrets)).toEqual([]);
      }
    },
    240_000,
  );
});
