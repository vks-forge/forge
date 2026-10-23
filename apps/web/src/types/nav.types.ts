/**
 * Shapes for navigation entries and the theme choice.
 *
 * Why: the sidebar, the routes and the placeholder pages all read one list of destinations;
 *   a shared shape keeps a label, its URL segment and whether the screen exists yet.
 *
 * Exports: NavEntry, ThemeMode.
 * Depends on: nothing. Types only.
 */

/** One destination in the sidebar and the router. */
export interface NavEntry {
  /** Stable id, also the route segment under the project (`''` for Home) or under `/settings`. */
  readonly segment: string;
  readonly label: string;
  /** False while the screen is not built: the sidebar hides it, an old link still lands on a stub. */
  readonly built: boolean;
  /** One line on what the screen will do. */
  readonly blurb: string;
}

/** `system` follows the OS; `light` and `dark` are the user's explicit choice. */
export type ThemeMode = 'system' | 'light' | 'dark';
