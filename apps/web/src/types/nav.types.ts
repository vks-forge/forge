/**
 * Shapes for navigation entries and the theme choice.
 *
 * Why: the sidebar, the routes and the placeholder pages all read one list of destinations;
 *   a shared shape keeps a label, its URL segment and the build batch that fills it in step.
 *
 * Exports: NavEntry, ThemeMode.
 * Depends on: nothing. Types only.
 */

/** One destination in the sidebar and the router. */
export interface NavEntry {
  /** Stable id, also the route segment under the project (`''` for Home) or under `/settings`. */
  readonly segment: string;
  readonly label: string;
  /** Build-plan batch that delivers the screen, shown on its placeholder. */
  readonly batch: string;
  /** One line on what the screen will do. */
  readonly blurb: string;
}

/** `system` follows the OS; `light` and `dark` are the user's explicit choice. */
export type ThemeMode = 'system' | 'light' | 'dark';
