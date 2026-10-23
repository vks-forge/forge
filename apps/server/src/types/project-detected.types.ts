/**
 * Shape of what Forge detects in a registered project's folder.
 *
 * Why: the project page shows the owner what Forge found (which ecosystems, which checks it
 *   suggests, which setup steps it would run before each ticket) so the settings can be compared
 *   with it; one typed shape keeps the route and the service from guessing at each other.
 *
 * Exports: DetectedView.
 * Depends on: @forge/core (ProjectCheck, SetupStep). Types only.
 */

import type { ProjectCheck, SetupStep } from '@forge/core';

/** What `GET /projects/:slug/detected` answers. */
export interface DetectedView {
  readonly ecosystems: readonly string[];
  readonly checks: readonly ProjectCheck[];
  /** The default steps Forge runs in each new worktree; the settings' own `setup` replaces them. */
  readonly setup: readonly SetupStep[];
}
