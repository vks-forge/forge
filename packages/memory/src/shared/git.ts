/**
 * Minimal git runner for a project's private memory repository.
 *
 * Why: every memory write ends in one commit, and the Director must never be misled by the
 *   machine it runs on: a user's global git config (signing, hooks path, autocrlf) or an
 *   inherited `GIT_DIR` from the process that started Forge would send the commit to the
 *   wrong repository or fail it. This runs git without a shell, with a clean environment
 *   and a fixed Director identity, and turns a failure into a typed error.
 *
 * Exports: runGit(), DIRECTOR_NAME, DIRECTOR_EMAIL.
 * Depends on: node:child_process, node:util, @forge/core (CrashError).
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CrashError } from '@forge/core';

const execFileAsync = promisify(execFile);

export const DIRECTOR_NAME = 'Forge Director';
export const DIRECTOR_EMAIL = 'forge@localhost';

const FIXED_CONFIG = [
  '-c',
  `user.name=${DIRECTOR_NAME}`,
  '-c',
  `user.email=${DIRECTOR_EMAIL}`,
  '-c',
  'commit.gpgsign=false',
  '-c',
  'core.autocrlf=false',
];

function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR']) {
    delete env[key];
  }

  env['GIT_TERMINAL_PROMPT'] = '0';

  return env;
}

/** Runs `git <args>` in `cwd` and returns trimmed stdout; throws CrashError when git fails or is missing. */
export async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', [...FIXED_CONFIG, ...args], {
      cwd,
      env: cleanEnv(),
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    });

    return stdout.trim();
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();

    throw new CrashError(
      `git ${args[0] ?? ''} failed in the memory repository${stderr ? `: ${stderr}` : ''}`,
      { cause: error },
    );
  }
}
