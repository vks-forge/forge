/**
 * Types for per-ecosystem setup recipes and the folders detection reads.
 *
 * Why: a fresh worktree needs the project's dependencies before checks can run, and how to get
 *   them differs per language (d-0176). A recipe is plain data: which files in a folder mean
 *   "this project uses that tool", and the steps to run then. Detection and the preparer read
 *   only these shapes, so adding an ecosystem is one table row and no code anywhere else.
 *
 * Exports: RecipeStep, SetupRecipe, SetupDetectionInput, SetupPlace.
 * Depends on: @forge/core (SetupStep, types only).
 */

import type { SetupStep } from '@forge/core';

/** A step as a recipe writes it: only name and command are required; defaults fill the rest. */
export type RecipeStep = Pick<SetupStep, 'name' | 'command'> &
  Partial<
    Pick<
      SetupStep,
      | 'inputs'
      | 'env'
      | 'path'
      | 'timeout_minutes'
      | 'cache_env'
      | 'cache_outputs'
      | 'toolchain'
    >
  >;

/** One row of the recipe table. The first row of an ecosystem whose markers match wins. */
export interface SetupRecipe {
  /** Ecosystem id from the registry (`node`, `python`, ...), or `any` for tool-independent steps. */
  readonly ecosystem: string;
  /** Short id of the tool the row sets up (`pnpm`, `uv`); for tests and messages. */
  readonly id: string;
  /** Entry-name globs (`pnpm-lock.yaml`, `*.csproj`); the row matches when at least one is present. */
  readonly any: readonly string[];
  /** Entry-name globs that must all be present as well. */
  readonly all?: readonly string[];
  /**
   * A last-resort row for a folder with a manifest but no lockfile (`package.json` alone). Rows
   * with a lockfile win first, wherever it sits (the project folder, then the repository top), so a
   * subfolder of a pnpm monorepo gets the monorepo's install, not `npm install`.
   */
  readonly fallback?: boolean;
  /** Only the repository top is looked at (`.gitmodules` lives there, whatever the project folder). */
  readonly repoTop?: boolean;
  readonly steps: readonly RecipeStep[];
}

/** The folders detection reads, as entry names (no paths). */
export interface SetupDetectionInput {
  /** Entries of the project folder. */
  readonly projectEntries: readonly string[];
  /** Entries of the repository top when the project is a subfolder of it; absent when the project folder is the top. */
  readonly repoEntries?: readonly string[];
}

/** A folder detection looks in, and whether steps found there run at the repository top. */
export interface SetupPlace {
  readonly entries: readonly string[];
  readonly atRepoRoot: boolean;
}
