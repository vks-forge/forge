/**
 * Default `GitPort`: asks the `git` binary what a run changed in its worktree.
 *
 * Why: what a Worker says it touched is a claim; the gate that follows must judge what is
 *   actually on disk. `git diff --name-only <base>` lists tracked files changed since the
 *   run began (committed or not), and `ls-files --others` adds new files the Worker created
 *   but never staged, which the diff alone would miss. `-z` keeps odd file names intact.
 *   A git failure is returned to the caller as an error so the driver can say "unknown"
 *   instead of reporting an empty, trustworthy-looking list.
 *
 * Exports: createGitCli().
 * Depends on: node:child_process, types/claude/driver-deps. IO: runs `git`.
 */

import { execFile } from 'node:child_process';
import type { GitPort } from '#/types/claude/driver-deps.types.js';

function git(cwd: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      [...args],
      { cwd, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });
}

const names = (out: string): string[] => out.split('\0').filter((n) => n.length > 0);

export function createGitCli(): GitPort {
  return {
    async head(cwd) {
      return (await git(cwd, ['rev-parse', 'HEAD'])).trim();
    },
    async changedFiles(cwd, base) {
      const [tracked, untracked] = await Promise.all([
        git(cwd, ['diff', '--name-only', '-z', base]),
        git(cwd, ['ls-files', '--others', '--exclude-standard', '-z']),
      ]);

      return [...new Set([...names(tracked), ...names(untracked)])].sort();
    },
  };
}
