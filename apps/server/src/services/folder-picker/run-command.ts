/**
 * Runs one program for the folder window and reports how it ended.
 *
 * Why: a folder window is a child program that can sit open for as long as the person likes,
 *   or never show at all. It is started with `execFile` (arguments are never parsed by a
 *   shell, so a folder name cannot become a command), killed after a time limit so a window
 *   left behind a browser cannot hold the picker forever, and every ending (missing program,
 *   non-zero exit, timeout) becomes plain data for the per-OS parsers.
 *
 * Exports: createCommandRunner(), PICKER_TIMEOUT_MS.
 * Depends on: node:child_process, types/folder-picker. IO: spawns a process.
 */

import { execFile } from 'node:child_process';
import type { CommandResult, CommandRunner } from '#/types/folder-picker.types.js';

/** Ten minutes: long enough to browse, short enough that a forgotten window frees the picker. */
export const PICKER_TIMEOUT_MS = 10 * 60 * 1000;

export function createCommandRunner(
  timeoutMs: number = PICKER_TIMEOUT_MS,
): CommandRunner {
  return (file, args, env) =>
    new Promise<CommandResult>((resolve) => {
      execFile(
        file,
        [...args],
        {
          encoding: 'utf8',
          timeout: timeoutMs,
          windowsHide: true,
          env: { ...process.env, ...env },
        },
        (error, stdout, stderr) => {
          const failure = error as
            (NodeJS.ErrnoException & { killed?: boolean; code?: number | string }) | null;

          const missing = failure?.code === 'ENOENT';
          const timedOut = failure?.killed === true;
          const code = !failure
            ? 0
            : typeof failure.code === 'number'
              ? failure.code
              : null;

          resolve({ code, stdout, stderr, missing, timedOut });
        },
      );
    });
}
