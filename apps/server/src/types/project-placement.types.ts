/**
 * Type of a resolved project placement.
 *
 * Why: registration resolves where a project's repository is (and whether Forge must start
 *   one) once, and three places read the answer: the host picker, the base-branch check and
 *   the repository starter. One named shape keeps them agreeing (d-0124).
 *
 * Exports: Placement.
 * Depends on: @forge/core (GitInspection, GitSetup). Types only.
 */

import type { GitInspection, GitSetup } from '@forge/core';

/** Where the project lives and how its repository is obtained. */
export interface Placement {
  /** The project's folder: the repository top, or the chosen subfolder. */
  readonly localPath: string;
  /** Set only for a project scoped to a subfolder. */
  readonly repoRoot?: string;
  readonly subfolder?: string;
  /** Set when the folder has no repository yet. */
  readonly setup: GitSetup | null;
  readonly git: GitInspection;
}
