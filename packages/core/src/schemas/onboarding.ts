/**
 * Shapes of the first-run and new-project answers: `GET /system` and `POST /projects/inspect`.
 *
 * Why: a person installing Forge needs the UI to know, without any hand-edited file, whether
 *   setup is finished (so the wizard shows once), where Forge keeps its files (so Forge settings
 *   can show it), and what a folder they typed looks like before a project is created on
 *   it (so a wrong folder or branch is caught in the form, not on save). One definition here
 *   means the server that builds these answers and the web app that reads them cannot drift.
 *   Neither answer carries a secret: no token, no key, no harness credential.
 *
 * Exports: FirstRunState, SystemInfo, GitState, GitInspection, SnapshotInspection, GitSetup,
 *   ProjectScope, ProjectInspection.
 * Depends on: schemas/project (ProjectCheck), schemas/setup-step, zod. No IO.
 */

import { z } from 'zod';
import { ProjectCheck } from '#/schemas/project.js';
import { SetupStep } from '#/schemas/setup-step.js';

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

/** Where a folder stands with git: its own repository, no repository, or inside someone else's. */
export const GitState = z.enum(['repo', 'none', 'inside_repo']);
export type GitState = z.infer<typeof GitState>;

/**
 * What git says about the chosen folder (d-0124). `repo_root` is the top folder when the
 * folder is a repository or sits inside one; `subfolder` is the folder's path from that top
 * when it sits inside one. `remote` is `origin` (else the first remote) when there is one;
 * `github` is set only when its URL names a GitHub repository.
 */
export const GitInspection = z.object({
  state: GitState,
  repo_root: z.string().min(1).nullable(),
  subfolder: z.string().min(1).nullable(),
  has_commits: z.boolean(),
  dirty: z.boolean(),
  remote: z
    .object({
      name: z.string().min(1),
      url: z.string().min(1),
      github: z.object({ owner: z.string().min(1), repo: z.string().min(1) }).nullable(),
    })
    .nullable(),
});
export type GitInspection = z.infer<typeof GitInspection>;

/** What a snapshot commit of a folder with no repository would take in; counted, never read. */
export const SnapshotInspection = z.object({
  files: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  has_gitignore: z.boolean(),
  /** True when counting stopped at the size guard: the real totals are larger. */
  truncated: z.boolean(),
});
export type SnapshotInspection = z.infer<typeof SnapshotInspection>;

/** `POST /projects` `git_setup`: how Forge starts a repository in a folder that has none. */
export const GitSetup = z.object({ mode: z.enum(['snapshot', 'init_only']) }).strict();
export type GitSetup = z.infer<typeof GitSetup>;

/** `POST /projects` `scope`: use the repository's top folder, or only the chosen subfolder. */
export const ProjectScope = z.object({ mode: z.enum(['root', 'subfolder']) }).strict();
export type ProjectScope = z.infer<typeof ProjectScope>;

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
  /** The steps Forge would run in each new worktree before a Worker starts (installs); empty when the project needs none. */
  setup: z.array(SetupStep).default([]),
  /** A slug and ticket prefix no registered project uses. */
  suggested_slug: z.string().min(1),
  suggested_prefix: z.string().min(1),
  git: GitInspection,
  /** Set when `git.state` is `none`: what a snapshot commit would include. */
  snapshot: SnapshotInspection.nullable(),
});
export type ProjectInspection = z.infer<typeof ProjectInspection>;
