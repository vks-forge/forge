/**
 * Process runner for the git binary.
 *
 * Why: every git call must pass arguments as an array with no shell, so a branch name or
 *   commit message can never be interpreted as shell syntax, and must fail loudly: a git
 *   error becomes a typed CrashError carrying the stderr tail, so the engine can retry or
 *   stall by error family instead of parsing text, and a failure is never read as an
 *   empty result.
 *
 * Exports: createGitRunner().
 * Depends on: node:child_process, @forge/core (CrashError), types/git-worktree. IO: spawns git.
 */

import { execFile } from 'node:child_process';
import { CrashError } from '@forge/core';
import type { GitRunner } from '#/types/git-worktree.types.js';

const MAX_BUFFER = 64 * 1024 * 1024;
const STDERR_TAIL = 1000;

export function createGitRunner(gitBinary: string): GitRunner {
  const tryRun: GitRunner['try'] = (cwd, args, opts) =>
    new Promise((resolve, reject) => {
      execFile(
        gitBinary,
        [...args],
        {
          cwd,
          shell: false,
          windowsHide: true,
          maxBuffer: MAX_BUFFER,
          encoding: 'utf8',
          env: { ...process.env, ...opts?.env },
        },
        (error, stdout, stderr) => {
          if (!error) {
            return resolve({ code: 0, stdout, stderr });
          }

          // A numeric code is a git exit status; a string code (ENOENT, ...) means git never ran.
          if (typeof error.code === 'number') {
            return resolve({ code: error.code, stdout, stderr });
          }

          reject(
            new CrashError(`could not run git ${args[0] ?? ''}: ${error.message}`, {
              cause: error,
            }),
          );
        },
      );
    });

  return {
    try: tryRun,
    async run(cwd, args, opts) {
      const r = await tryRun(cwd, args, opts);
      if (r.code !== 0) {
        const tail = r.stderr.trim().slice(-STDERR_TAIL);
        throw new CrashError(`git ${args[0] ?? ''} failed (exit ${r.code}): ${tail}`);
      }

      return r.stdout;
    },
  };
}
