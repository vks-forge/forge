/**
 * Linux and other Unix folder window: `zenity`, then `kdialog`.
 *
 * Why: there is no folder window built into Linux; GNOME desktops ship `zenity` and KDE ships
 *   `kdialog`. Trying both covers the common desktops with no dependency. When neither exists,
 *   or there is no desktop session (a headless box or SSH shell), the answer is `unavailable`
 *   so the page shows its own folder browser instead of a button that does nothing. Exit
 *   code 1 from either tool means the person cancelled.
 *
 * Exports: pickOnLinux(), parseLinuxResult().
 * Depends on: services/folder-picker/{clean-path,win32-script}, types/folder-picker. IO: spawns zenity or kdialog.
 */

import type { FolderPick } from '@forge/core';
import { cancelled, picked, unavailable } from '#/services/folder-picker/clean-path.js';
import { PICKER_TITLE } from '#/services/folder-picker/win32-script.js';
import type { CommandResult, PlatformPicker } from '#/types/folder-picker.types.js';

/** Output and exit code of zenity or kdialog to a pick result; `undefined` when the program is missing (try the next). */
export function parseLinuxResult(result: CommandResult): FolderPick | undefined {
  if (result.missing) {
    return undefined;
  }

  if (result.timedOut) {
    return cancelled();
  }

  if (result.code === 0) {
    return picked(result.stdout);
  }

  if (result.code === 1 && !/display|wayland|cannot open/i.test(result.stderr)) {
    return cancelled();
  }

  return unavailable(
    result.stderr.trim().split('\n')[0] || 'the folder window could not start',
  );
}

export const pickOnLinux: PlatformPicker = async (run, start, env) => {
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY) {
    return unavailable('no desktop session to show a folder window on');
  }

  const attempts: [string, string[]][] = [
    [
      'zenity',
      [
        '--file-selection',
        '--directory',
        `--title=${PICKER_TITLE}`,
        ...(start === undefined ? [] : [`--filename=${start.replace(/\/+$/, '')}/`]),
      ],
    ],
    [
      'kdialog',
      [
        '--title',
        PICKER_TITLE,
        '--getexistingdirectory',
        ...(start === undefined ? [] : [start]),
      ],
    ],
  ];

  for (const [file, args] of attempts) {
    const answer = parseLinuxResult(await run(file, args));

    if (answer) {
      return answer;
    }
  }

  return unavailable('neither zenity nor kdialog is installed');
};
