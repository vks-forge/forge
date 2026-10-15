/**
 * `setMatchMedia()`: lets a test decide what the browser's media queries answer.
 *
 * Why: the shell switches between sidebar and drawer on a width query, and motion honours the
 *   OS reduced-motion query. jsdom has no `matchMedia`, so tests install one and say per query
 *   whether it matches (narrow screen, reduced motion, dark mode).
 *
 * Exports: setMatchMedia().
 * Depends on: nothing (window).
 */

/** Replaces `window.matchMedia`; `matches` decides per query. Default: nothing matches. */
export function setMatchMedia(matches: (query: string) => boolean = () => false): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: matches(query),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
      onchange: null,
    }),
  });
}
