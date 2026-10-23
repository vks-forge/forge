/**
 * WorktreePreparer port — gets a fresh worktree ready for a Worker.
 *
 * Why: Workers are denied package installs, yet the checks that judge their work need the
 *   project's dependencies (`node_modules`, `.venv`, `vendor/`). Forge therefore runs the
 *   project's setup steps itself, outside the Worker's tool policy, before the Worker starts
 *   and again before gates when an input file changed (d-0180). The engine must not know any
 *   tool or language (d-0176), so it asks this port for a plan and runs it; an ecosystem is
 *   data inside the adapter, and a project with no ecosystem gets an empty plan and no error.
 *
 * Exports: WorktreePreparer, PrepareOptions.
 * Depends on: schemas/project, schemas/worktree-prep. Types only.
 */

import type { ProjectConfig } from '#/schemas/project.js';
import type { PrepOutcome, PrepPlan, WorktreePrep } from '#/schemas/worktree-prep.js';

export interface PrepareOptions {
  /** The commit the worktree was cut from; tells a Worker's edit of an input file from base content. */
  readonly baseSha: string;
  /** Called with a step's name just before it runs, so the owner can see which step a wait is on. */
  readonly onStep?: (name: string) => void;
}

/** Plans and runs worktree setup. Paths are the worktree paths a `WorktreeManager` hands out. */
export interface WorktreePreparer {
  /** The steps to run: the owner's `setup` when the settings have one (even empty), else defaults detected from the worktree. */
  plan(worktreePath: string, config: Pick<ProjectConfig, 'setup'>): Promise<PrepPlan>;
  /**
   * Runs the plan unless the stored record already matches it (same steps, same input file
   * contents), stops at the first failing step, and stores the record on success. An empty plan
   * succeeds at once and stores nothing. A failing step is an outcome, never a throw; only
   * unexpected faults (an unreadable worktree) throw.
   */
  prepare(
    worktreePath: string,
    plan: PrepPlan,
    opts: PrepareOptions,
  ): Promise<PrepOutcome>;
  /**
   * Stores a `skipped` record for the plan as it stands (the owner chose to start without
   * setup), so a later `prepare` of the same plan and inputs succeeds without running a step.
   */
  skip(worktreePath: string, plan: PrepPlan): Promise<WorktreePrep>;
}
