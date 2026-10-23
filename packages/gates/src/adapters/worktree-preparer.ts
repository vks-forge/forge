/**
 * Worktree preparer — runs a project's setup steps in a fresh worktree before a Worker starts.
 *
 * Why: Workers may not install packages, yet the checks that judge their work need the
 *   project's `node_modules`, `.venv` or `vendor/`. Forge installs them itself, outside the
 *   Worker's tool policy and with network allowed (d-0180), for any language through the
 *   recipe table (d-0176). It skips the install when the stored record's key matches (same
 *   steps, same lockfile bytes), stops at the first failing step and reports it as an outcome
 *   (step, exit code, output tail) instead of throwing, and records which top-level paths the
 *   install created so they never reach the Worker's diff or commit. A step that fails after the
 *   Worker edited one of its input files is flagged, because the Worker's change is the likely
 *   cause and the work should go back to the Worker rather than to the owner. Steps get a
 *   scrubbed environment plus their own variables and `pass_env` names; the project's tool
 *   folders (`path`) go first on PATH once they exist, so a later step finds the `python` of the
 *   virtual environment an earlier one created.
 *
 *   Installs repeat for every ticket, so two layers of reuse sit on top, both driven by the step's
 *   recipe data and both inert without a `cacheDir`: `cache_env` points the tool's download cache
 *   at a Forge-owned folder for that step only (downloads shared, nothing relocated), and
 *   `cache_outputs` folders are copied back from an earlier identical run so the command is
 *   skipped (setup-cache). Any cache error runs the step normally and is logged; the cache never
 *   fails a step or a ticket.
 *
 * Exports: createWorktreePreparer().
 * Depends on: node:fs, node:path, @forge/core (WorktreePreparer, SetupStep, globMatch), adapters/{command-runner,prep-key,step-cache},
 *   domain/detect-setup, shared/{env,tail}, types/worktree-preparer. IO: spawns the steps' commands, reads input files.
 */

import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { delimiter, join, relative, resolve } from 'node:path';
import { globMatch, MAX_PREP_OUTPUTS, MAX_PREP_TAIL } from '@forge/core';
import type { PrepPlan, SetupStep, WorktreePrep, WorktreePreparer } from '@forge/core';
import { runShellCommand } from '#/adapters/command-runner.js';
import { computePrepKey, stepFolder } from '#/adapters/prep-key.js';
import { createStepCache } from '#/adapters/step-cache.js';
import { detectSetup } from '#/domain/detect-setup.js';
import { prependPath, scrubEnv } from '#/shared/env.js';
import { tail } from '#/shared/tail.js';
import type { StepRun, WorktreePreparerDeps } from '#/types/worktree-preparer.types.js';

const MINUTE_MS = 60_000;
/** Leaves room for the "[...cut...]" marker inside the schema's tail limit. */
const TAIL_KEEP = MAX_PREP_TAIL - 100;

const slash = (p: string): string => p.replaceAll('\\', '/');
const same = (a: string, b: string): boolean => resolve(a) === resolve(b);

export function createWorktreePreparer(deps: WorktreePreparerDeps): WorktreePreparer {
  const { worktrees } = deps;
  const run = deps.runCommand ?? runShellCommand;
  const now = deps.now ?? ((): Date => new Date());

  const cache = createStepCache(deps, run);

  const entries = (dir: string): Promise<string[]> => readdir(dir).catch(() => []);

  const folders = (path: string): { project: string; root: string } => ({
    project: path,
    root: worktrees.rootOf(path),
  });

  /** Tool folders of `steps` that exist now, absolute, each step's `path` taken from its own folder. */
  const toolFolders = (
    steps: readonly SetupStep[],
    f: ReturnType<typeof folders>,
  ): string[] => {
    const found = steps.flatMap((s) =>
      s.path.map((p) => join(stepFolder(s, f.project, f.root), p)),
    );

    return [...new Set(found.filter((p) => existsSync(p)).map(slash))];
  };

  /** True when the Worker's changes (against the base) touch a file one of the steps reads. */
  async function workerChangedInputs(
    steps: readonly SetupStep[],
    f: ReturnType<typeof folders>,
    baseSha: string,
  ): Promise<boolean> {
    // Best effort: a git failure here must not hide the step failure that is being reported.
    const changed = await worktrees.changedFiles(f.project, baseSha).catch(() => []);

    return changed.some((c) =>
      steps.some((s) => {
        const folder = stepFolder(s, f.project, f.root);
        const rel = slash(relative(folder, resolve(f.project, c)));

        return !rel.startsWith('..') && s.inputs.some((g) => globMatch(g, rel, true));
      }),
    );
  }

  async function runStep(
    step: SetupStep,
    folder: string,
    dirs: readonly string[],
  ): Promise<StepRun> {
    const started = now().getTime();
    const env = prependPath(
      { ...scrubEnv(deps.env, step.pass_env), ...cache.env(step), ...step.env },
      dirs,
      delimiter,
    );

    const failed = (exit: number | null, timedOut: boolean, output: string): StepRun => ({
      ms: now().getTime() - started,
      exit: exit ?? -1,
      failure: {
        ok: false,
        step: step.name,
        command: step.command,
        exit_code: exit,
        timed_out: timedOut,
        tail: tail(output, TAIL_KEEP),
      },
    });

    try {
      const r = await run({
        command: step.command,
        cwd: folder,
        env,
        timeoutMs: step.timeout_minutes * MINUTE_MS,
        trustedDirs: dirs,
      });

      if (r.exitCode === 0 && !r.timedOut) {
        return { ms: now().getTime() - started, failure: null, exit: 0 };
      }

      return failed(r.exitCode, r.timedOut, r.output);
    } catch (e) {
      // The command could not start (not on PATH, refused by the resolver): same outcome as a failing step.
      return failed(null, false, e instanceof Error ? e.message : String(e));
    }
  }

  const record = (
    status: WorktreePrep['status'],
    key: string,
    parts: Partial<WorktreePrep> = {},
  ): WorktreePrep => ({
    key,
    status,
    outputs: [],
    path: [],
    steps: [],
    at: now().toISOString(),
    ...parts,
  });

  return {
    async plan(worktreePath, config): Promise<PrepPlan> {
      if (config.setup !== undefined) {
        return { steps: config.setup, source: 'settings' };
      }

      const f = folders(worktreePath);
      const repoEntries = same(f.root, f.project) ? undefined : await entries(f.root);
      const steps = detectSetup({
        projectEntries: await entries(f.project),
        ...(repoEntries === undefined ? {} : { repoEntries }),
      });

      return { steps, source: 'detected' };
    },

    async prepare(worktreePath, plan, opts) {
      const f = folders(worktreePath);
      const key = await computePrepKey(plan.steps, f.project, f.root);
      if (plan.steps.length === 0) {
        return { ok: true, prep: record('ready', key) };
      }

      const stored = await worktrees.readPrep(worktreePath);
      if (stored !== null && stored.key === key) {
        return { ok: true, prep: stored };
      }

      const before = await worktrees.untracked(worktreePath);
      const done: WorktreePrep['steps'] = [];
      for (const [i, step] of plan.steps.entries()) {
        const dirs = toolFolders(plan.steps.slice(0, i + 1), f);
        opts.onStep?.(step.name);
        const folder = stepFolder(step, f.project, f.root);
        const started = now().getTime();
        const cached = await cache.restore(step, folder, dirs);
        if (cached.restored) {
          done.push({
            name: step.name,
            exit_code: 0,
            ms: now().getTime() - started,
            restored: true,
          });

          continue;
        }

        const r = await runStep(step, folder, dirs);
        if (r.failure !== null) {
          return {
            ...r.failure,
            inputs_changed_by_worker: await workerChangedInputs(
              plan.steps,
              f,
              opts.baseSha,
            ),
          };
        }

        done.push({ name: step.name, exit_code: r.exit, ms: r.ms });
        if (cached.key !== null) {
          cache.store(step, folder, cached.key);
        }
      }

      const after = await worktrees.untracked(worktreePath);
      const created = after.filter((n) => !before.includes(n));
      const kept = (stored?.outputs ?? []).filter((n) => after.includes(n));
      const prep = record('ready', key, {
        outputs: [...new Set([...created, ...kept])].sort().slice(0, MAX_PREP_OUTPUTS),
        path: toolFolders(plan.steps, f),
        steps: done,
      });

      await worktrees.writePrep(worktreePath, prep);

      return { ok: true, prep };
    },

    async skip(worktreePath, plan) {
      const f = folders(worktreePath);
      const prep = record('skipped', await computePrepKey(plan.steps, f.project, f.root));
      await worktrees.writePrep(worktreePath, prep);

      return prep;
    },
  };
}
