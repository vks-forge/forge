/**
 * Setup step schema — one command Forge runs in a fresh worktree before a Worker starts.
 *
 * Why: Workers may not install packages, so Forge installs what the project's checks need
 *   (`npm ci`, `uv sync`, `cargo fetch`, ...) itself, outside the Worker's tool policy and with
 *   network allowed (d-0180). What to run differs per language, so the steps are project
 *   settings the owner can see and edit, with detected defaults when the settings say nothing
 *   (d-0176). Validating them when settings are saved turns a typo, a folder that escapes the
 *   repository or a duplicate name into an immediate error instead of a failed ticket.
 *
 *   Installs are slow and repeat for every ticket of a project, so a step may also say how to
 *   reuse work: `cache_env` points the tool's own download cache at a Forge-owned folder shared by
 *   every worktree, and `cache_outputs` names install folders safe to copy back into a later
 *   worktree whose inputs are identical (skipping the command). Only the recipe or the owner
 *   marks a folder relocatable; Forge never guesses (a Python virtual environment is not).
 *
 * Exports: SetupStep, SetupSteps.
 * Depends on: schemas/relative-dir, zod. No IO.
 */

import { z } from 'zod';
import { RelativeDir } from '#/schemas/relative-dir.js';

/** An environment variable name: letters, digits and underscore, not starting with a digit. */
const EnvName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'must be a variable name');

/**
 * One setup step. `cwd` is relative to the project folder, or to the repository top with
 * `at_repo_root`. `inputs` are the files whose content decides whether the step runs again (the
 * prep key). `path` lists folders put first on PATH when they exist (`.venv/bin`), for later
 * steps, gate checks and the Worker. `pass_env` names variables copied from the server
 * environment (registry tokens); their values are never stored. `cache_env` maps a variable to a
 * folder name (a relative path) under Forge's download-cache folder; Forge sets the variable for
 * this step only. `cache_outputs` are folders (relative to the step's folder) restored by copy
 * when an earlier run with the same key stored them; empty turns the copy cache off.
 * `toolchain` is a command whose output (`node --version`) joins the copy-cache key.
 */
export const SetupStep = z.object({
  name: z.string().trim().min(1),
  command: z.string().trim().min(1),
  cwd: RelativeDir.optional(),
  at_repo_root: z.boolean().optional(),
  inputs: z.array(z.string().min(1)).default([]),
  env: z.record(EnvName, z.string()).default({}),
  pass_env: z.array(EnvName).default([]),
  path: z.array(RelativeDir).default([]),
  cache_env: z.record(EnvName, RelativeDir).default({}),
  cache_outputs: z.array(RelativeDir).max(10).default([]),
  toolchain: z.string().trim().min(1).optional(),
  timeout_minutes: z.number().int().min(1).max(120).default(20),
});
export type SetupStep = z.infer<typeof SetupStep>;

/** Up to ten steps with unique names (the escalation card names the one that failed). */
export const SetupSteps = z
  .array(SetupStep)
  .max(10)
  .refine(
    (list) => new Set(list.map((s) => s.name)).size === list.length,
    'setup step names must be unique',
  );
