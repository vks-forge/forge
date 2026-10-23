/**
 * Worktree preparation schemas — what Forge records and reports about setting up a worktree.
 *
 * Why: Workers may not install packages, so before one starts Forge runs the project's setup
 *   steps itself (d-0180). Three things must be told apart without reading tool output: what
 *   will run (the plan, and whether it came from the owner's settings or from detection), what
 *   happened last time (the record kept beside the worktree, whose `key` lets an unchanged
 *   lockfile skip the install and whose `outputs` keep install folders out of the Worker's
 *   diff), and why a run failed (which step, how, and whether the Worker's own edit to an
 *   input file is the likely cause, which decides between sending the work back and asking
 *   the owner). One schema set keeps the git adapter, the preparer and the engine in step.
 *
 * Exports: MAX_PREP_OUTPUTS, MAX_PREP_TAIL, WorktreePrep, PrepPlan, PrepFailure, PrepOutcome.
 * Depends on: schemas/run, schemas/setup-step, zod. No IO.
 */

import { z } from 'zod';
import { Sha256Hex } from '#/schemas/run.js';
import { SetupStep } from '#/schemas/setup-step.js';

/** Most untracked top-level paths a record keeps (install folders are few; more is a runaway). */
export const MAX_PREP_OUTPUTS = 50;
/** Longest failure tail, in characters. */
export const MAX_PREP_TAIL = 4096;

/**
 * The record stored per worktree. `skipped` means the owner chose to start without setup.
 * `outputs` are repository-relative untracked paths the steps created (excluded from the
 * diff); `path` are absolute folders that existed after the steps and go first on PATH.
 */
export const WorktreePrep = z.object({
  key: Sha256Hex,
  status: z.enum(['ready', 'skipped']),
  outputs: z.array(z.string().min(1)).max(MAX_PREP_OUTPUTS),
  path: z.array(z.string().min(1)),
  steps: z.array(
    z.object({
      name: z.string().min(1),
      exit_code: z.number().int(),
      ms: z.number().int().nonnegative(),
      /** True when the step's folders were copied back from the setup cache and its command did not run. */
      restored: z.boolean().optional(),
    }),
  ),
  at: z.iso.datetime(),
});
export type WorktreePrep = z.infer<typeof WorktreePrep>;

/** What will run: the steps and where they came from. An empty plan means nothing to do. */
export const PrepPlan = z.object({
  steps: z.array(SetupStep),
  source: z.enum(['detected', 'settings']),
});
export type PrepPlan = z.infer<typeof PrepPlan>;

export const PrepFailure = z.object({
  ok: z.literal(false),
  step: z.string().min(1),
  command: z.string().min(1),
  /** Null when the command never started or was killed. */
  exit_code: z.number().int().nullable(),
  timed_out: z.boolean(),
  tail: z.string().max(MAX_PREP_TAIL),
  /** The Worker changed one of the steps' input files, so its own edit may have broken the install. */
  inputs_changed_by_worker: z.boolean(),
});
export type PrepFailure = z.infer<typeof PrepFailure>;

export const PrepOutcome = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), prep: WorktreePrep }),
  PrepFailure,
]);
export type PrepOutcome = z.infer<typeof PrepOutcome>;
