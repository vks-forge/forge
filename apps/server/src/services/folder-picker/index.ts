/**
 * The system folder window: picks the OS's implementation and allows one window at a time.
 *
 * Why: the new-project form needs the absolute path of a clone, and the native folder window
 *   (Explorer, Finder, zenity) is what people already know how to use. Forge runs on the
 *   person's own desktop, so the server can open it. The OS is chosen by a table lookup, a
 *   second click while a window is open is refused (two windows would fight for the answer),
 *   and a folder to open in is used only if it is absolute and exists. Anything that goes
 *   wrong inside a platform becomes `unavailable`, never a crash, so the page can fall back.
 *
 * Exports: createFolderPicker().
 * Depends on: node:fs/promises, node:path, services/folder-picker/*, services/http/http-errors, types/folder-picker.
 *   IO: spawns the OS dialog program; stats the start folder.
 */

import { stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { FolderPick } from '@forge/core';
import { unavailable } from '#/services/folder-picker/clean-path.js';
import { pickOnMac } from '#/services/folder-picker/darwin.js';
import { pickOnLinux } from '#/services/folder-picker/linux.js';
import { createCommandRunner } from '#/services/folder-picker/run-command.js';
import { pickOnWindows } from '#/services/folder-picker/win32.js';
import { HttpError } from '#/services/http/http-errors.js';
import type {
  CommandRunner,
  FolderPicker,
  PlatformPicker,
} from '#/types/folder-picker.types.js';

/** Every platform Node names; those without a desktop dialog of their own use the Unix pickers. */
export const PLATFORM_PICKERS: Readonly<Record<NodeJS.Platform, PlatformPicker>> = {
  win32: pickOnWindows,
  darwin: pickOnMac,
  linux: pickOnLinux,
  aix: pickOnLinux,
  android: pickOnLinux,
  cygwin: pickOnLinux,
  freebsd: pickOnLinux,
  haiku: pickOnLinux,
  netbsd: pickOnLinux,
  openbsd: pickOnLinux,
  sunos: pickOnLinux,
};

async function usableStart(start: string | undefined): Promise<string | undefined> {
  if (!start || !isAbsolute(start)) {
    return undefined;
  }

  try {
    return (await stat(start)).isDirectory() ? start : undefined;
  } catch {
    return undefined;
  }
}

export function createFolderPicker(
  options: {
    platform?: NodeJS.Platform;
    run?: CommandRunner;
    env?: NodeJS.ProcessEnv;
  } = {},
): FolderPicker {
  const platform = options.platform ?? process.platform;
  const run = options.run ?? createCommandRunner();
  const env = options.env ?? process.env;
  let open = false;

  return {
    async pick(start): Promise<FolderPick> {
      if (open) {
        throw new HttpError(
          409,
          'picker_busy',
          'A folder window is already open on this computer; finish or close it first',
        );
      }

      open = true;

      try {
        return await PLATFORM_PICKERS[platform](run, await usableStart(start), env);
      } catch (error) {
        return unavailable(
          error instanceof Error ? error.message : 'folder window failed',
        );
      } finally {
        open = false;
      }
    },
  };
}
