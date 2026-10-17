/**
 * `transitionKey()`: which URLs count as the same screen for the page transition.
 *
 * Why: the transition replays (and remounts the screen) whenever its key changes. A project's
 *   settings are tabs under one editor that holds the draft; replaying on a tab switch would
 *   remount the editor and silently drop the owner's unsaved edits. The same holds for one card
 *   or one ticket: its tabs (`/cards/FX-C2/plan`) are views of one page that holds the scroll
 *   memory, an open stream and a half-typed message. All tabs of one project's settings, one
 *   card or one ticket therefore share a key, while every other URL keeps its own.
 *
 * Exports: transitionKey().
 * Depends on: nothing. No IO.
 */

export function transitionKey(pathname: string): string {
  const shared = /^(\/p\/[^/]+\/(?:settings|(?:cards|tickets)\/[^/]+))(\/|$)/.exec(
    pathname,
  );

  return shared?.[1] ?? pathname;
}
