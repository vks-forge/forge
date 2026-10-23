/**
 * Rig for the worktree preparer tests: a temp worktree on disk, an in-memory worktree manager and
 * a scripted command runner.
 *
 * Why: the preparer's behaviour (skip on an equal key, stop at the first failure, record what a
 *   step created) depends on files in the worktree and on what each command does. The rig lets a
 *   test say what a command does (print, fail, create `.venv/bin`) without spawning anything, and
 *   records every call so the test can check the order, folder and environment of each step.
 *
 * Exports: makeRig(), useRigs(), Rig, ScriptedStep.
 * Depends on: node:fs, node:os, node:path, @forge/core (types), types/g1-deps, adapters/worktree-preparer.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { WorktreePrep, WorktreePreparer } from '@forge/core';
import { afterEach } from 'vitest';
import { createWorktreePreparer } from '#/adapters/worktree-preparer.js';
import type { CommandRequest, CommandResult } from '#/types/g1-deps.types.js';
import type { PreparerWorktrees } from '#/types/worktree-preparer.types.js';

/** What a scripted command does when it runs. */
export interface ScriptedStep {
  readonly result?: Partial<CommandResult>;
  /** Throws instead of returning, like a command that could not start. */
  readonly rejects?: Error;
  /** Folders (relative to the command's cwd) the command creates. */
  readonly makes?: readonly string[];
  /** Untracked top-level names the worktree lists after the command ran. */
  readonly untracked?: readonly string[];
}

export interface Rig {
  readonly root: string;
  /** The project folder: the worktree root, or `subdir` inside it. */
  readonly project: string;
  prep: WorktreePreparer;
  readonly calls: CommandRequest[];
  /** Background cache stores started so far; await them with `settle()`. */
  readonly stores: Promise<void>[];
  /** Messages the preparer logged. */
  readonly logs: string[];
  settle(): Promise<void>;
  record: WorktreePrep | null;
  /** Untracked names `untracked()` reports now. */
  listing: string[];
  /** Files `changedFiles` reports. */
  changed: string[];
  /** Queue of scripted results, taken in order; an empty queue means "succeeds, prints nothing". */
  script: ScriptedStep[];
  write(rel: string, content: string): void;
  clock: { t: number };
  close(): void;
}

export function makeRig(
  opts: { subdir?: string; env?: Record<string, string>; cacheDir?: string } = {},
): Rig {
  const root = mkdtempSync(join(tmpdir(), 'forge prep '));
  const project = opts.subdir === undefined ? root : join(root, opts.subdir);
  mkdirSync(project, { recursive: true });
  const calls: CommandRequest[] = [];
  const clock = { t: Date.parse('2026-10-20T10:00:00.000Z') };
  const rig: Rig = {
    root,
    project,
    calls,
    stores: [],
    logs: [],
    settle: async () => {
      await Promise.all(rig.stores);
    },
    record: null,
    listing: [],
    changed: [],
    script: [],
    clock,
    write(rel, content) {
      const full = join(root, rel);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    },
    close: () => rmSync(root, { recursive: true, force: true }),
    prep: undefined as unknown as WorktreePreparer,
  };

  const worktrees: PreparerWorktrees = {
    rootOf: () => root,
    untracked: async () => [...rig.listing],
    readPrep: async () => rig.record,
    writePrep: async (_path, prep) => {
      rig.record = prep;
    },
    changedFiles: async () => [...rig.changed],
  };

  const runCommand = async (req: CommandRequest): Promise<CommandResult> => {
    calls.push(req);
    clock.t += 1000;
    const next = rig.script.shift() ?? {};
    if (next.rejects) {
      throw next.rejects;
    }

    for (const dir of next.makes ?? []) {
      mkdirSync(join(req.cwd, dir), { recursive: true });
    }

    if (next.untracked) {
      rig.listing = [...next.untracked];
    }

    return { exitCode: 0, timedOut: false, output: '', ...next.result };
  };

  rig.prep = createWorktreePreparer({
    worktrees,
    env: { PATH: '/usr/bin', NPM_TOKEN: 'secret', ANTHROPIC_API_KEY: 'k', ...opts.env },
    runCommand,
    now: () => new Date(clock.t),
    ...(opts.cacheDir === undefined
      ? {}
      : {
          cacheDir: opts.cacheDir,
          trackStore: (p: Promise<void>) => rig.stores.push(p),
          log: (_l: string, m: string) => rig.logs.push(m),
        }),
  });

  return rig;
}

/** Call at the top of a test file: returns a rig maker whose rigs are deleted after each test. */
export function useRigs(): (...args: Parameters<typeof makeRig>) => Rig {
  const made: Rig[] = [];
  afterEach(() => {
    for (const r of made.splice(0)) {
      r.close();
    }
  });

  return (...args) => {
    const r = makeRig(...args);
    made.push(r);

    return r;
  };
}
