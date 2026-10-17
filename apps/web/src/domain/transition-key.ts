/**
 * `transitionKey()`: which URLs count as the same screen for the page transition.
 *
 * Why: the transition replays (and remounts the screen) whenever its key changes. A project's
 *   settings are tabs under one editor that holds the draft; replaying on a tab switch would
 *   remount the editor and silently drop the owner's unsaved edits. All tabs of one project's
 *   settings therefore share a key, while every other URL keeps its own.
 *
 * Exports: transitionKey().
 * Depends on: nothing. No IO.
 */

export function transitionKey(pathname: string): string {
  const settings = /^(\/p\/[^/]+\/settings)(\/|$)/.exec(pathname);

  return settings?.[1] ?? pathname;
}
