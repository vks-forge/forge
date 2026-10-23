/**
 * Types for the worktree preparer adapter.
 *
 * Why: the preparer runs project commands and touches the worktree, so everything it needs
 *   from the outside (the worktree manager's record and listing methods, the server
 *   environment, a command runner, a clock) is injected. Tests then run it with no process
 *   spawned and no real git.
 *
 * Exports: PreparerWorktrees, WorktreePreparerDeps, StepFailure, StepRun, CacheEntryMeta, StepCache.
 * Depends on: @forge/core (WorktreeManager, PrepFailure, types only), types/g1-deps. Types only.
 */

import type { PrepFailure, SetupStep, WorktreeManager } from '@forge/core';
import type { RunCommand } from '#/types/g1-deps.types.js';

/** The worktree manager methods the preparer uses. */
export type PreparerWorktrees = Pick<
  WorktreeManager,
  'rootOf' | 'untracked' | 'readPrep' | 'writePrep' | 'changedFiles'
>;

export interface WorktreePreparerDeps {
  readonly worktrees: PreparerWorktrees;
  /** The server's environment; only an allowlist of it (plus a step's `pass_env`) reaches a step. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Defaults to the real shell runner. */
  readonly runCommand?: RunCommand;
  /** Defaults to the system clock. */
  readonly now?: () => Date;
  /**
   * Forge's cache folder (`<dataHome>/cache`). Absent means no caching: steps run exactly as
   * written. Download caches live in `downloads/`, restorable install folders in `setup/`.
   */
  readonly cacheDir?: string;
  /**
   * Most bytes `setup/` may hold before the least recently used entries go (default 5 GB). A
   * function is read at every store, so a changed company setting applies without a restart.
   */
  readonly cacheBudgetBytes?: number | (() => number | Promise<number>);
  /** Receives each background store so a caller (a test, shutdown) can wait for it. Defaults to ignoring it. */
  readonly trackStore?: (done: Promise<void>) => void;
  /** Where cache problems are reported; the cache never fails a step. */
  readonly log?: (level: 'info' | 'warn', message: string) => void;
}

/** What a stored copy-cache entry records beside its folders. */
export interface CacheEntryMeta {
  readonly key: string;
  readonly bytes: number;
  readonly outputs: readonly string[];
}

/** A failed step as the preparer sees it, before it knows whether the Worker changed an input file. */
export type StepFailure = Omit<PrepFailure, 'inputs_changed_by_worker'>;

/** One step's run: how long it took, its exit code (-1 when it never exited) and why it failed, if it did. */
export interface StepRun {
  readonly restored?: boolean;
  readonly ms: number;
  readonly exit: number;
  readonly failure: StepFailure | null;
}

/** What the preparer asks of the cache for one step (see adapters/step-cache). */
export interface StepCache {
  /** Variables for the step's environment: its `cache_env` names mapped to Forge-owned folders. */
  env(step: SetupStep): Record<string, string>;
  /** Copies the step's outputs back when an identical run was stored; `key` is set when a store should follow a run. */
  restore(
    step: SetupStep,
    folder: string,
    dirs: readonly string[],
  ): Promise<{ key: string | null; restored: boolean }>;
  /** Stores the outputs of a step that just ran, without waiting for the copy. */
  store(step: SetupStep, folder: string, key: string): void;
}
