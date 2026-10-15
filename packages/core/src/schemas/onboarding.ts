/**
 * Shapes of the first-run and new-project answers: `GET /system` and `POST /projects/inspect`.
 *
 * Why: a person installing Forge needs the UI to know, without any hand-edited file, whether
 *   setup is finished (so the wizard shows once), where Forge keeps its files (so the first
 *   step can say it), and what a folder they typed looks like before a project is created on
 *   it (so a wrong folder or branch is caught in the form, not on save). One definition here
 *   means the server that builds these answers and the web app that reads them cannot drift.
 *   Neither answer carries a secret: no token, no key, no harness credential.
 *
 * Exports: FirstRunState, SystemInfo, ProjectInspection.
 * Depends on: schemas/project (ProjectCheck), zod. No IO.
 */

import { z } from 'zod';
import { ProjectCheck } from '#/schemas/project.js';

/**
 * Where setup stands, derived from what exists rather than stored: a Forge with at least one
 * registered project is set up (that is what the wizard produces), so there is no flag to
 * drift, and a fresh data home shows the wizard again by itself.
 */
export const FirstRunState = z.object({
  /** True once any project is registered (archived ones count: setup was done). */
  complete: z.boolean(),
  project_count: z.number().int().nonnegative(),
  /** True when a harness has passed its last test; lets the wizard resume past step 2. */
  harness_ok: z.boolean(),
});
export type FirstRunState = z.infer<typeof FirstRunState>;

/** `GET /system`. */
export const SystemInfo = z.object({
  service: z.literal('forge'),
  version: z.string().min(1),
  /** The folder holding the database, settings, memory repositories and Worker worktrees. */
  data_home: z.string().min(1),
  first_run: FirstRunState,
});
export type SystemInfo = z.infer<typeof SystemInfo>;

/** `POST /projects/inspect`: what a folder looks like as a project, nothing created. */
export const ProjectInspection = z.object({
  local_path: z.string().min(1),
  /** The branch the clone has checked out; null on a detached HEAD. */
  current_branch: z.string().min(1).nullable(),
  /** The branch the project would use: the one asked for, else the checked-out one. */
  base_branch: z.string().min(1),
  /** Local branches, alphabetical, bounded. */
  branches: z.array(z.string().min(1)),
  branches_truncated: z.boolean(),
  /** Ecosystem ids found at the repository root. */
  ecosystems: z.array(z.string().min(1)),
  /** Checks worth running, from the root's manifest; the user edits them before saving. */
  checks: z.array(ProjectCheck),
  /** A slug and ticket prefix no registered project uses. */
  suggested_slug: z.string().min(1),
  suggested_prefix: z.string().min(1),
});
export type ProjectInspection = z.infer<typeof ProjectInspection>;
