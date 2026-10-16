/**
 * macOS folder window: `osascript` with `choose folder`.
 *
 * Why: Finder's own folder sheet is what Mac users expect, and `osascript` ships with every
 *   Mac, so nothing is installed. Asking System Events to activate first brings the sheet in
 *   front of the browser. Cancelling is reported by AppleScript as error -128 with exit code
 *   1, which is a normal answer, not a failure. The start folder goes in as a script argument
 *   (`argv`), never spliced into script text.
 *
 * Exports: pickOnMac(), parseMacResult().
 * Depends on: services/folder-picker/{clean-path,win32-script}, types/folder-picker. IO: spawns osascript.
 */

import type { FolderPick } from '@forge/core';
import { cancelled, picked, unavailable } from '#/services/folder-picker/clean-path.js';
import { PICKER_TITLE } from '#/services/folder-picker/win32-script.js';
import type { CommandResult, PlatformPicker } from '#/types/folder-picker.types.js';

/** Output and exit code of `osascript` to a pick result. */
export function parseMacResult(result: CommandResult): FolderPick {
  if (result.missing) {
    return unavailable('osascript was not found on this machine');
  }

  if (result.timedOut) {
    return cancelled();
  }

  if (result.code === 1 && /User canceled|\(-128\)/i.test(result.stderr)) {
    return cancelled();
  }

  if (result.code !== 0) {
    return unavailable(result.stderr.trim() || 'the folder window could not start');
  }

  return picked(result.stdout);
}

export const pickOnMac: PlatformPicker = async (run, start) => {
  const activate = ['-e', 'tell application "System Events" to activate'];
  const choose = `choose folder with prompt "${PICKER_TITLE}"`;
  const args =
    start === undefined
      ? [...activate, '-e', `POSIX path of (${choose})`]
      : [
          '-e',
          'on run argv',
          ...activate,
          '-e',
          `return POSIX path of (${choose} default location (POSIX file (item 1 of argv)))`,
          '-e',
          'end run',
          start,
        ];

  return parseMacResult(await run('osascript', args));
};
