/**
 * Real command runner — spawns a project command in the platform shell.
 *
 * Why: G1 re-runs the repo's own lint, typecheck and test commands on the Worker's
 *   worktree, because the Worker's claim that they pass is untrusted. The commands are
 *   strings the repo owner wrote in `.forge/project.yaml` (not Worker input), often with
 *   pipes or `&&`, so they run through the shell. A hung test run must not hang the
 *   server: on timeout the whole process tree is killed (on Windows `taskkill /T /F`,
 *   because killing the shell alone leaves node children holding the worktree open).
 *   The cwd is the Worker's tree, so the first token is resolved to an absolute executable
 *   outside it first (cmd.exe would otherwise run a Worker-committed `pnpm.cmd`), and the
 *   child gets `NoDefaultCurrentDirectoryInExePath=1` for the later segments of the line.
 *
 * Exports: runShellCommand(), MAX_CAPTURE_BYTES.
 * Depends on: node:child_process, node:fs, domain/command-resolver, types/g1-deps. Spawns processes.
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { statSync } from 'node:fs';
import { InvalidInputError } from '@forge/core';
import { resolveCommand } from '#/domain/command-resolver.js';
import type { CommandRequest, CommandResult } from '#/types/g1-deps.types.js';

/** Output kept in memory; older output is dropped. */
export const MAX_CAPTURE_BYTES = 64 * 1024;
/** After killing, wait this long for pipes to close before giving up on them. */
const KILL_GRACE_MS = 2000;

function killTree(child: ChildProcess): void {
  const pid = child.pid;
  if (pid === undefined) {
    return;
  }

  if (process.platform === 'win32') {
    spawn('taskkill', ['/T', '/F', '/PID', String(pid)], {
      stdio: 'ignore',
      windowsHide: true,
    }).on('error', () => child.kill());

    return;
  }

  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Runs `req.command` with `shell: true` after pinning its first token to an absolute
 * executable outside `req.cwd`; resolves with the exit code, or `timedOut`. Rejects when the
 * command cannot be resolved safely or the process cannot start.
 */
export function runShellCommand(req: CommandRequest): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const env = { ...req.env, NoDefaultCurrentDirectoryInExePath: '1' };
    const resolved = resolveCommand(req.command, {
      platform: process.platform === 'win32' ? 'win32' : 'posix',
      cwd: req.cwd,
      env,
      isFile,
    });

    if (!resolved.ok) {
      reject(
        new InvalidInputError(`refusing to run \`${req.command}\`: ${resolved.reason}`),
      );

      return;
    }

    const child = spawn(resolved.command, {
      cwd: req.cwd,
      env,
      shell: true,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    let timedOut = false;
    let settled = false;
    const collect = (chunk: Buffer): void => {
      output += chunk.toString('utf8');
      if (output.length > MAX_CAPTURE_BYTES) {
        output = output.slice(output.length - MAX_CAPTURE_BYTES);
      }
    };

    const finish = (exitCode: number | null): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      clearTimeout(grace);
      resolve({ exitCode, timedOut, output });
    };

    let grace: NodeJS.Timeout | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
      grace = setTimeout(() => finish(null), KILL_GRACE_MS);
    }, req.timeoutMs);

    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    child.on('error', (e) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        clearTimeout(grace);
        reject(e);
      }
    });

    child.on('close', (code) => finish(code));
  });
}
