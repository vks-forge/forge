/**
 * Setup draft: the pure rules behind the "Before each ticket" editor.
 *
 * Why: before a Worker starts, Forge runs the project's setup steps (installing packages) in the
 *   fresh worktree, because Workers may not install (d-0180). The steps are whatever the project's
 *   language needs (d-0176), so the editor cannot assume a tool: it shows each step's own command
 *   and the file it was detected from. This file turns detected or saved steps into editable rows
 *   and back into the document a save writes, and finds the problems core would refuse (a folder
 *   outside the repository, a repeated name, a time limit out of range) while the owner is still
 *   typing, so a typo never becomes a failed ticket. The cache settings (d-0176 recipes) ride
 *   through a save untouched, so saving here never erases them; only the copy-cache switch clears
 *   the restored folders. Pure.
 *
 * Exports: MAX_SETUP_STEPS, rowsFromSteps(), stepsFromRows(), setupIssues(), setupSource(),
 *   blankSetupRow(), commandsLine(), cacheLine().
 * Depends on: @forge/core (SetupStep type), types/project-settings.types. No IO.
 */

import type { SetupStep } from '@forge/core';
import type { SetupRow } from '#/types/project-settings.types.js';

/** Core allows at most ten steps. */
export const MAX_SETUP_STEPS = 10;

const DEFAULT_TIMEOUT = 20;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const OUTSIDE = /^([a-z]:)?[\\/]|(^|[\\/])\.\.($|[\\/])/i;

const lines = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

const isOutside = (folder: string): boolean => OUTSIDE.test(folder);

/** A new, empty step for "Add step". */
export function blankSetupRow(): SetupRow {
  return {
    name: '',
    command: '',
    cwd: '',
    at_repo_root: false,
    env: {},
    inputs: '',
    path: '',
    pass_env: '',
    timeout: String(DEFAULT_TIMEOUT),
    cache_env: {},
    cache_outputs: [],
    copy_cache: true,
  };
}

/** Steps as editable rows. */
export function rowsFromSteps(steps: readonly SetupStep[]): SetupRow[] {
  return steps.map((step) => ({
    name: step.name,
    command: step.command,
    cwd: step.cwd ?? '',
    at_repo_root: step.at_repo_root ?? false,
    env: step.env,
    inputs: step.inputs.join('\n'),
    path: step.path.join('\n'),
    pass_env: step.pass_env.join('\n'),
    timeout: String(step.timeout_minutes),
    cache_env: step.cache_env,
    cache_outputs: step.cache_outputs,
    ...(step.toolchain === undefined ? {} : { toolchain: step.toolchain }),
    copy_cache: true,
  }));
}

/** Rows as the steps a save writes: trimmed, empty optional parts left out. */
export function stepsFromRows(rows: readonly SetupRow[]): Record<string, unknown>[] {
  return rows.map((row) => ({
    name: row.name.trim(),
    command: row.command.trim(),
    ...(row.cwd.trim() === '' ? {} : { cwd: row.cwd.trim() }),
    ...(row.at_repo_root ? { at_repo_root: true } : {}),
    inputs: lines(row.inputs),
    env: row.env,
    pass_env: lines(row.pass_env),
    path: lines(row.path),
    // The copy-cache switch only ever clears the folders; the rest rides through (a save must
    // never erase cache settings the editor does not show).
    cache_env: row.cache_env,
    cache_outputs: row.copy_cache ? row.cache_outputs : [],
    ...(row.toolchain === undefined ? {} : { toolchain: row.toolchain }),
    timeout_minutes: Number(row.timeout),
  }));
}

/** Problems that would make the server refuse the steps, in plain words; empty when they are fine. */
export function setupIssues(rows: readonly SetupRow[]): string[] {
  const issues: string[] = [];
  const names = rows.map((row) => row.name.trim());

  if (rows.length > MAX_SETUP_STEPS) {
    issues.push(`Use at most ${MAX_SETUP_STEPS} setup steps.`);
  }

  if (rows.some((row) => row.name.trim() === '' || row.command.trim() === '')) {
    issues.push('Every setup step needs a name and a command.');
  } else if (new Set(names).size !== names.length) {
    issues.push('Setup step names must be unique.');
  }

  if (rows.some((row) => isOutside(row.cwd) || lines(row.path).some(isOutside))) {
    issues.push(
      'A folder must be inside the repository (no leading slash, no “..”). This covers the step folder and the PATH folders.',
    );
  }

  if (
    rows.some((row) => {
      const minutes = Number(row.timeout);

      return !Number.isInteger(minutes) || minutes < 1 || minutes > 120;
    })
  ) {
    issues.push('A time limit is a whole number of minutes from 1 to 120.');
  }

  if (rows.some((row) => lines(row.pass_env).some((name) => !ENV_NAME.test(name)))) {
    issues.push(
      'A variable to pass is a name such as REGISTRY_TOKEN: letters, digits and underscore.',
    );
  }

  return issues;
}

/** The file a detected step was found from, as "from <file>", or undefined when it names none. */
export function setupSource(step: {
  readonly inputs: readonly string[];
}): string | undefined {
  const file = step.inputs[0];

  return file === undefined ? undefined : `from ${file}`;
}

/**
 * What the step reuses between tickets, in plain words: the folders it restores by copy, or that
 * its downloads are shared, or that it has no cache. `copyOn` false reads as the copy turned off.
 */
export function cacheLine(
  step: {
    readonly cache_outputs: readonly string[];
    readonly cache_env: Readonly<Record<string, string>>;
  },
  copyOn = true,
): string {
  if (copyOn && step.cache_outputs.length > 0) {
    return `Cache: restores ${step.cache_outputs.join(', ')}`;
  }

  return Object.keys(step.cache_env).length > 0 ? 'Downloads shared' : 'No cache';
}

/** The commands as one line, for the wizard and the card: "a, b". */
export function commandsLine(steps: readonly { readonly command: string }[]): string {
  return steps.map((step) => step.command).join(', ');
}
