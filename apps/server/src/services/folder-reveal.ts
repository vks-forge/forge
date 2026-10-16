/**
 * Shows a folder in the computer's file manager (Explorer, Finder, the Linux default).
 *
 * Why: the folder browser's right-click menu offers "Show in Explorer" so a person can check
 *   what is inside a folder before choosing it. Forge runs on their own desktop, so the server
 *   starts the OS file manager. The program is picked from a table by platform, the path is
 *   passed as one argument (never through a shell), and only an existing absolute folder is
 *   opened. No desktop or no file manager is an ordinary `unavailable` answer, not an error.
 *
 * Exports: createFolderRevealer(), REVEAL_PROGRAMS.
 * Depends on: node:fs/promises, node:path, services/folder-picker/run-command, services/http/http-errors,
 *   types/folder-picker, @forge/core (FolderReveal, type). IO: spawns the OS file manager; stats the folder.
 */

import { stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { FolderReveal } from '@forge/core';
import { createCommandRunner } from '#/services/folder-picker/run-command.js';
import { HttpError } from '#/services/http/http-errors.js';
import type { CommandRunner, FolderRevealer } from '#/types/folder-picker.types.js';

/** The file manager program per platform; Unix-likes without their own use xdg-open. */
export const REVEAL_PROGRAMS: Readonly<Record<NodeJS.Platform, string>> = {
  win32: 'explorer.exe',
  darwin: 'open',
  linux: 'xdg-open',
  aix: 'xdg-open',
  android: 'xdg-open',
  cygwin: 'xdg-open',
  freebsd: 'xdg-open',
  haiku: 'xdg-open',
  netbsd: 'xdg-open',
  openbsd: 'xdg-open',
  sunos: 'xdg-open',
};

const REVEAL_TIMEOUT_MS = 10_000;

export function createFolderRevealer(
  options: { platform?: NodeJS.Platform; run?: CommandRunner } = {},
): FolderRevealer {
  const platform = options.platform ?? process.platform;
  const run = options.run ?? createCommandRunner(REVEAL_TIMEOUT_MS);

  return {
    async reveal(path): Promise<FolderReveal> {
      if (!isAbsolute(path)) {
        throw new HttpError(400, 'invalid_path', 'path must be an absolute folder path');
      }

      try {
        if (!(await stat(path)).isDirectory()) {
          throw new HttpError(400, 'not_a_directory', `${path} is a file, not a folder`);
        }
      } catch (error) {
        if (error instanceof HttpError) {
          throw error;
        }

        throw new HttpError(404, 'folder_not_found', `${path} does not exist`);
      }

      const program = REVEAL_PROGRAMS[platform];
      const result = await run(program, [path]);

      if (result.missing) {
        return {
          status: 'unavailable',
          reason: `${program} was not found on this machine`,
        };
      }

      // Explorer exits 1 even when it opened the window, so only a missing program is a failure there.
      if (platform !== 'win32' && result.code !== 0 && !result.timedOut) {
        return {
          status: 'unavailable',
          reason:
            result.stderr.trim().split('\n')[0] || 'the file manager could not start',
        };
      }

      return { status: 'opened' };
    },
  };
}
