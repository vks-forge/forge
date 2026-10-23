/**
 * Setup detection — the default setup steps for the files a project folder holds.
 *
 * Why: before a Worker starts, Forge installs the project's dependencies (d-0180), and the
 *   owner should not have to type `npm ci` or `uv sync` for a project whose lockfile already says
 *   which tool it uses. This reads the entry names of the project folder, and of the repository
 *   top when the project is a subfolder of a larger repository, and picks one row per ecosystem
 *   from the recipe table. A project that sits in a monorepo uses the monorepo's lockfile
 *   (steps then run at the repository top). A project that matches nothing gets an empty list,
 *   which means "no setup", never an error (d-0176). The result is a suggestion: the owner's
 *   settings replace it.
 *
 * Exports: detectSetup().
 * Depends on: @forge/core (SetupStep), domain/ecosystems/setup-recipes, shared/entry-glob, types/setup. No IO.
 */

import { SetupStep } from '@forge/core';
import { SETUP_RECIPES } from '#/domain/ecosystems/setup-recipes.js';
import { hasEntry } from '#/shared/entry-glob.js';
import type {
  SetupDetectionInput,
  SetupPlace,
  SetupRecipe,
} from '#/types/setup.types.js';

const matches = (recipe: SetupRecipe, entries: readonly string[]): boolean =>
  recipe.any.some((g) => hasEntry(entries, g)) &&
  (recipe.all ?? []).every((g) => hasEntry(entries, g));

/** The first row that matches: lockfile rows before fallback rows, the project folder before the repository top. */
function pick(
  rows: readonly SetupRecipe[],
  places: readonly SetupPlace[],
): { recipe: SetupRecipe; atRepoRoot: boolean } | null {
  for (const fallback of [false, true]) {
    for (const place of places) {
      const recipe = rows.find(
        (r) => (r.fallback ?? false) === fallback && matches(r, place.entries),
      );

      if (recipe) {
        return { recipe, atRepoRoot: place.atRepoRoot };
      }
    }
  }

  return null;
}

/** Default setup steps, in run order; empty when no recipe matches. */
export function detectSetup(input: SetupDetectionInput): SetupStep[] {
  const project: SetupPlace = { entries: input.projectEntries, atRepoRoot: false };
  const top: SetupPlace | null = input.repoEntries
    ? { entries: input.repoEntries, atRepoRoot: true }
    : null;

  const taken = new Set<string>();
  const steps: SetupStep[] = [];
  for (const ecosystem of new Set(SETUP_RECIPES.map((r) => r.ecosystem))) {
    const rows = SETUP_RECIPES.filter((r) => r.ecosystem === ecosystem);
    const repoTopRows = rows.filter((r) => r.repoTop === true);
    const found =
      repoTopRows.length > 0
        ? pick(repoTopRows, [top ?? project])
        : pick(rows, top ? [project, top] : [project]);

    for (const step of found?.recipe.steps ?? []) {
      if (!taken.has(step.name)) {
        taken.add(step.name);
        const atRoot = found?.atRepoRoot === true;
        steps.push(
          SetupStep.parse({ ...step, ...(atRoot ? { at_repo_root: true } : {}) }),
        );
      }
    }
  }

  return steps;
}
