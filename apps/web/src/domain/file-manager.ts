/**
 * The name of this computer's file manager, for the words on a menu item.
 *
 * Why: the folder browser can show a folder in the system file manager, and "Show in
 *   Explorer" on a Mac or "Show in Finder" on Windows reads as a bug. The browser runs on
 *   the same machine as Forge, so its own platform is the right one to name. Unknown
 *   systems get the neutral "file manager". Pure apart from reading the user agent.
 *
 * Exports: fileManagerName(), revealLabel().
 * Depends on: none. Reads navigator.userAgent.
 */

/** `Explorer`, `Finder` or `file manager`. */
export function fileManagerName(
  userAgent: string = globalThis.navigator?.userAgent ?? '',
): string {
  if (/Windows/i.test(userAgent)) {
    return 'Explorer';
  }

  if (/Mac|iPhone|iPad/i.test(userAgent)) {
    return 'Finder';
  }

  return 'file manager';
}

/** The menu item text: "Show in Explorer". */
export function revealLabel(userAgent?: string): string {
  return `Show in ${fileManagerName(userAgent)}`;
}
