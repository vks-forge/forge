/**
 * Fake WorktreePreparer: setup steps the test controls, with no process spawned.
 *
 * Why: the engine never knows a tool or a language, so its preparation behaviour (wait, park,
 *   retry, skip, resume) is pinned against a preparer whose outcome the test sets: instant success,
 *   a held install that finishes when released, or a failing step. It counts the runs, like the
 *   real one, a prepare of an already prepared tree is no run, so a test can say "did not install
 *   again".
 *
 * Exports: FakePreparer, createFakePreparer(), failure().
 * Depends on: @forge/core (types, SetupStep). No IO.
 */

import { SetupStep } from '@forge/core';
import type { PrepFailure, PrepOutcome, PrepPlan, WorktreePreparer } from '@forge/core';

export interface FakePreparer extends WorktreePreparer {
  /** Steps `plan()` returns; empty means nothing to install. */
  steps: SetupStep[];
  /** True: the next successful run reports its step as restored from the setup cache. */
  restored: boolean;
  /** What the next real run returns. */
  result: PrepOutcome;
  /** Worktrees a step actually ran in (a skip of an already-prepared tree is not here). */
  readonly ran: string[];
  /** Worktrees `skip` stored a record for. */
  readonly skipped: string[];
  /** The `baseSha` each `prepare` was given. */
  readonly baseShas: string[];
  /** Holds the next run until the returned function is called. */
  hold(): () => void;
  /** Forgets every prepared tree, as if the Worker had changed a file the steps read. */
  invalidate(): void;
}

const record = (status: 'ready' | 'skipped', restored = false) => ({
  key: 'a'.repeat(64),
  status,
  outputs: [],
  path: [],
  steps: [
    { name: 'Install packages', exit_code: 0, ms: 5, ...(restored ? { restored } : {}) },
  ],
  at: '2026-10-21T00:00:00.000Z',
});

/** A failing step as the real preparer reports it. */
export const failure = (over: Partial<PrepFailure> = {}): PrepFailure => ({
  ok: false,
  step: 'Install packages',
  command: 'pnpm install --frozen-lockfile',
  exit_code: 1,
  timed_out: false,
  tail: 'ERR_PNPM_OUTDATED_LOCKFILE',
  inputs_changed_by_worker: false,
  ...over,
});

export function createFakePreparer(withSteps = true): FakePreparer {
  let gate: Promise<void> | null = null;
  const prepared = new Set<string>();
  const fake: FakePreparer = {
    steps: withSteps
      ? [
          SetupStep.parse({
            name: 'Install packages',
            command: 'pnpm install --frozen-lockfile',
          }),
        ]
      : [],
    restored: false,
    result: { ok: true, prep: record('ready') },
    ran: [],
    skipped: [],
    baseShas: [],
    async plan(): Promise<PrepPlan> {
      return { steps: fake.steps, source: 'detected' };
    },
    async prepare(path, plan, opts) {
      fake.baseShas.push(opts.baseSha);
      if (prepared.has(path)) {
        return { ok: true, prep: record('ready') };
      }

      fake.ran.push(path);
      opts.onStep?.(plan.steps[0]?.name ?? '');
      if (gate) {
        await gate;
      }

      if (fake.result.ok) {
        prepared.add(path);

        return fake.restored ? { ok: true, prep: record('ready', true) } : fake.result;
      }

      return fake.result;
    },
    async skip(path) {
      fake.skipped.push(path);
      prepared.add(path);

      return record('skipped');
    },
    invalidate() {
      prepared.clear();
    },
    hold() {
      let release!: () => void;
      gate = new Promise<void>((resolve) => {
        release = (): void => {
          gate = null;
          resolve();
        };
      });

      return release;
    },
  };

  return fake;
}
