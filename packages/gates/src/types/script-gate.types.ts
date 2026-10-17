/**
 * Dependencies of the script gate runner.
 *
 * Why: the runner judges a Worker's tree with a command the owner wrote, so every source of
 *   evidence and side effect is injected: the diff (which of the owner's guarded paths the Worker
 *   touched), the parent environment (of which only an allowlist reaches the command) and the
 *   process spawner. Tests run it with fakes; the server gives it the real worktree manager.
 *
 * Exports: ScriptGateDeps.
 * Depends on: @forge/core (WorktreeManager), types/g1-deps. Types only.
 */

import type { WorktreeManager } from '@forge/core';
import type { RunCommand } from '#/types/g1-deps.types.js';

export interface ScriptGateDeps {
  readonly worktrees: Pick<WorktreeManager, 'diff'>;
  /** Parent environment; only an allowlist of it reaches the command (shared/env). */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Extra variable names to pass from `env` (default: none). */
  readonly passEnv?: readonly string[];
  /** Defaults to the real spawner. */
  readonly runCommand?: RunCommand;
}
