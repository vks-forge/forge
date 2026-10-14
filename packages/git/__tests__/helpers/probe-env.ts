/**
 * Shared harness for the live GitHub probe: gating, config from env, git runner, leak scan.
 *
 * Why: the probe pushes to a real repository as the Forge GitHub App, so it must never run in
 *   plain `pnpm test`, and the App and installation ids must never be committed (d-0062): they
 *   come from the operator's shell. Git is run with the installation token only in the child
 *   environment, and every message that leaves a helper is scrubbed, so a failing probe cannot
 *   leak the credential into a log or an artefact.
 *
 * Exports: ProbeConfig, probeConfig(), SKIP_REASON, REPO_ROOT, freshProbeDir(), gitIn(),
 *   scrubSecrets(), findSecretLeaks(), tokenFromAuthEnv().
 * Depends on: node:child_process, node:fs, node:path, node:url, src/domain/push-env.
 *   IO: spawns git, writes under .forge/data/probes/.
 */

import { execFile } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { redactSecrets } from '#/domain/push-env.js';

/** Absolute repo root, from this file's location (packages/git/__tests__/helpers). */
export const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

/** Shown in the test title so a skip explains itself. */
export const SKIP_REASON =
  '[skipped unless FORGE_PROBES=1, FORGE_PROBE_GITHUB=1 and FORGE_GH_APP_ID, FORGE_GH_INSTALLATION_ID, FORGE_GH_OWNER, FORGE_GH_REPO are set]';

const TOKEN_SHAPE = /gh[pousr]_[A-Za-z0-9]{20,}/;
const JWT_SHAPE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/;

export interface ProbeConfig {
  readonly appId: string;
  readonly installationId: string;
  readonly owner: string;
  readonly repo: string;
  readonly base: string;
}

/** Everything the probe needs from the operator's shell; null unless `FORGE_PROBES=1`, `FORGE_PROBE_GITHUB=1` and every App variable are set. */
export function probeConfig(): ProbeConfig | null {
  const env = process.env;
  const appId = env['FORGE_GH_APP_ID'];
  const installationId = env['FORGE_GH_INSTALLATION_ID'];
  const owner = env['FORGE_GH_OWNER'];
  const repo = env['FORGE_GH_REPO'];
  // FORGE_PROBE_GITHUB is a second, explicit opt-in: the App variables sit in a shell for
  // other reasons, and `pnpm probes` must not push to a real repository because they do.
  if (
    env['FORGE_PROBES'] !== '1' ||
    env['FORGE_PROBE_GITHUB'] !== '1' ||
    !appId ||
    !installationId ||
    !owner ||
    !repo
  ) {
    return null;
  }

  return { appId, installationId, owner, repo, base: env['FORGE_GH_BASE'] ?? 'main' };
}

/** Recreates and returns `.forge/data/probes/<...segments>` (gitignored). */
export function freshProbeDir(...segments: string[]): string {
  const dir = join(REPO_ROOT, '.forge', 'data', 'probes', ...segments);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  return dir;
}

/** The token carried by a `buildPushEnv` result, for leak scanning only (never logged). */
export function tokenFromAuthEnv(authEnv: Record<string, string>): string {
  const value = authEnv['GIT_CONFIG_VALUE_0'] ?? '';
  const basic = value.replace('AUTHORIZATION: basic ', '');

  return Buffer.from(basic, 'base64').toString().replace('x-access-token:', '');
}

/** Scrubs the given secrets plus anything shaped like an installation token or a JWT. */
export function scrubSecrets(text: string, secrets: readonly string[]): string {
  return redactSecrets(text, secrets)
    .replace(new RegExp(TOKEN_SHAPE, 'g'), '[redacted]')
    .replace(new RegExp(JWT_SHAPE, 'g'), '[redacted]');
}

/** Names of the secret shapes found in `text`: empty means clean. */
export function findSecretLeaks(text: string, secrets: readonly string[]): string[] {
  const leaks: string[] = [];
  if (secrets.some((s) => s.length > 0 && text.includes(s))) {
    leaks.push('known token');
  }

  if (TOKEN_SHAPE.test(text)) {
    leaks.push('token-shaped string');
  }

  if (JWT_SHAPE.test(text)) {
    leaks.push('JWT-shaped string');
  }

  return leaks;
}

/** Runs git in `cwd` (no shell, prompts off); rejects with the scrubbed stderr tail on failure. */
export function gitIn(
  cwd: string,
  args: readonly string[],
  opts: { env?: Record<string, string>; secrets?: readonly string[] } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      [...args],
      {
        cwd,
        shell: false,
        windowsHide: true,
        encoding: 'utf8',
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...opts.env },
      },
      (error, stdout, stderr) => {
        if (error) {
          const tail = scrubSecrets(stderr.trim().slice(-500), opts.secrets ?? []);
          reject(new Error(`git ${args[0] ?? ''} failed: ${tail}`));

          return;
        }

        resolve(stdout);
      },
    );
  });
}
