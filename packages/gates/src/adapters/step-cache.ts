/**
 * Step cache — the preparer's view of the download folders and the copy cache for one step.
 *
 * Why: the preparer decides when a step runs; this decides what a step may reuse. It gives a
 *   step its Forge-owned download folders (`cache_env`), tries to restore its install folders
 *   from an identical earlier run (skipping the command), and stores them after a run. It sits
 *   apart from the preparer so that "any cache fault means run the step normally" lives in one
 *   place: every function here swallows errors, logs them and answers "no cache". With no
 *   `cacheDir` every function is a no-op. Ecosystem specifics come only from the step's data.
 *
 * Exports: createStepCache(), StepCache.
 * Depends on: node:fs, node:path, @forge/core (SetupStep), adapters/{prep-key,setup-cache},
 *   shared/env, types/worktree-preparer, types/g1-deps. IO: cache folder, toolchain probe command.
 */

import { mkdirSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { SetupStep } from '@forge/core';
import { computeStepCacheKey } from '#/adapters/prep-key.js';
import {
  DEFAULT_BUDGET_BYTES,
  evictOverBudget,
  restoreEntry,
  storeEntry,
} from '#/adapters/setup-cache.js';
import { prependPath, scrubEnv } from '#/shared/env.js';
import type { RunCommand } from '#/types/g1-deps.types.js';
import type { StepCache, WorktreePreparerDeps } from '#/types/worktree-preparer.types.js';

const PROBE_TIMEOUT_MS = 60_000;

export function createStepCache(deps: WorktreePreparerDeps, run: RunCommand): StepCache {
  const log = deps.log ?? ((): void => undefined);
  const probes = new Map<string, Promise<string | null>>();

  /** Folders the step's `cache_env` names, under `<cacheDir>/downloads`; none without a cache folder. */
  const cacheEnv = (step: SetupStep): Record<string, string> => {
    if (deps.cacheDir === undefined) {
      return {};
    }

    const out: Record<string, string> = {};
    for (const [name, rel] of Object.entries(step.cache_env)) {
      const dir = join(deps.cacheDir, 'downloads', rel);
      try {
        mkdirSync(dir, { recursive: true });
        out[name] = dir;
      } catch (e) {
        log(
          'warn',
          `download cache folder ${dir} unusable, step runs without it: ${String(e)}`,
        );
      }
    }

    return out;
  };

  /** The toolchain probe's trimmed output, once per command; null when it fails (then nothing is cached). */
  function probe(
    step: SetupStep,
    folder: string,
    dirs: readonly string[],
  ): Promise<string | null> {
    if (step.toolchain === undefined) {
      return Promise.resolve('');
    }

    const command = step.toolchain;
    const known = probes.get(command);
    if (known) {
      return known;
    }

    const env = prependPath(scrubEnv(deps.env, step.pass_env), dirs, delimiter);
    const p = run({
      command,
      cwd: folder,
      env,
      timeoutMs: PROBE_TIMEOUT_MS,
      trustedDirs: dirs,
    }).then(
      (r) => (r.exitCode === 0 && !r.timedOut ? r.output.trim() : null),
      () => null,
    );

    probes.set(command, p);

    return p;
  }

  /** Restores the step's outputs from the copy cache. `key` is set whenever the step may be stored after it runs. */
  async function restore(
    step: SetupStep,
    folder: string,
    dirs: readonly string[],
  ): Promise<{ key: string | null; restored: boolean }> {
    const { cacheDir } = deps;
    if (cacheDir === undefined || step.cache_outputs.length === 0) {
      return { key: null, restored: false };
    }

    try {
      const toolchain = await probe(step, folder, dirs);
      if (toolchain === null) {
        return { key: null, restored: false };
      }

      const key = await computeStepCacheKey(step, folder, toolchain);
      const restored = await restoreEntry(cacheDir, key, folder, step.cache_outputs);

      return { key, restored };
    } catch (e) {
      log(
        'warn',
        `setup cache lookup for "${step.name}" failed, running it: ${String(e)}`,
      );

      return { key: null, restored: false };
    }
  }

  /** The budget now: a setting read live, or the fixed value or default. */
  async function budgetBytes(): Promise<number> {
    const { cacheBudgetBytes } = deps;

    return typeof cacheBudgetBytes === 'function'
      ? cacheBudgetBytes()
      : (cacheBudgetBytes ?? DEFAULT_BUDGET_BYTES);
  }

  /** Stores the outputs of a step that just ran, beside the ticket; failures are logged and dropped. */
  function store(step: SetupStep, folder: string, key: string): void {
    const { cacheDir } = deps;
    if (cacheDir === undefined) {
      return;
    }

    const job = storeEntry(cacheDir, key, folder, step.cache_outputs)
      .then(() => budgetBytes())
      .then((budget) => evictOverBudget(cacheDir, budget))
      .then(() => undefined)
      .catch((e: unknown) =>
        log('warn', `setup cache store for "${step.name}" failed: ${String(e)}`),
      );

    (deps.trackStore ?? ((): void => undefined))(job);
  }

  return {
    env: cacheEnv,
    restore,
    store,
  };
}
