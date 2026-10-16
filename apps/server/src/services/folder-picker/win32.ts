/**
 * Windows folder window: runs the PowerShell program and reads its answer.
 *
 * Why: on Windows the person expects Explorer's folder window. This module is the whole
 *   Windows side: the command line (no profile, no prompts, single-threaded apartment as
 *   the dialog needs, script passed encoded so no quoting can alter it) and the reading of
 *   what it printed, kept pure so it is tested without opening a window.
 *
 * Exports: pickOnWindows(), parseWindowsResult().
 * Depends on: services/folder-picker/{clean-path,win32-script}, types/folder-picker. IO: spawns powershell.exe.
 */

import type { FolderPick } from '@forge/core';
import { cancelled, picked, unavailable } from '#/services/folder-picker/clean-path.js';
import {
  WIN32_PICKER_SCRIPT,
  WIN32_START_ENV,
} from '#/services/folder-picker/win32-script.js';
import type { CommandResult, PlatformPicker } from '#/types/folder-picker.types.js';

/** First useful line of an error stream, for the "why unavailable" note. */
function firstLine(text: string, fallback: string): string {
  const line = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l !== '' && !l.startsWith('#<'));

  return line ?? fallback;
}

/** Output and exit code of the PowerShell program to a pick result. */
export function parseWindowsResult(result: CommandResult): FolderPick {
  if (result.missing) {
    return unavailable('PowerShell was not found on this machine');
  }

  if (result.timedOut) {
    return cancelled();
  }

  if (result.code !== 0) {
    return unavailable(firstLine(result.stderr, 'the folder window could not start'));
  }

  return picked(result.stdout);
}

export const pickOnWindows: PlatformPicker = async (run, start) => {
  const encoded = Buffer.from(WIN32_PICKER_SCRIPT, 'utf16le').toString('base64');
  const result = await run(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-STA',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      encoded,
    ],
    { [WIN32_START_ENV]: start ?? '' },
  );

  return parseWindowsResult(result);
};
