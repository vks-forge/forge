/**
 * Small fakes for the engine's remaining ports: worktrees, memory, receipts, clock, ids.
 *
 * Why: the engine scenarios need git, project memory, the receipt chain and time to be
 *   present but boring, and observable where the engine's behaviour depends on them (which
 *   worktrees were created and removed, which files "changed", what the chain hash was, how
 *   far the clock moved). Each fake is a few lines over a Map, so the scenario reads as the
 *   behaviour under test and not as plumbing.
 *
 * Exports: FakeWorktrees, createFakeWorktrees(), createFakeMemory(), createFakeReceipts(),
 *   FakeReports, createFakeReports(),
 *   FakeClock, createFakeClock(), createIds().
 * Depends on: @forge/core, @forge/tools (types). No IO.
 */

import { filterMemorySlice } from '@forge/core';
import type {
  Clock,
  MemoryFilter,
  MemorySource,
  MergeInResult,
  ReportStore,
  TicketId,
  WorktreeManager,
} from '@forge/core';
import type { Receipt, ReceiptLog } from '@forge/tools';
import type { IdSource } from '#/types/engine.types.js';

export interface FakeWorktrees extends WorktreeManager {
  readonly created: { ticketId: string; branch: string; baseRef: string; path: string }[];
  readonly removed: string[];
  /** Local branches `remove` was asked to delete, in order. */
  readonly removedBranches: string[];
  readonly commits: { path: string; message: string }[];
  /** Every `mergeIn` call, in order. */
  readonly merges: { path: string; sha: string; message: string }[];
  /** What `mergeIn` answers; set a `conflict` or `merged` result to play a moved base. */
  mergeResult: MergeInResult;
  /** What `contains` answers for every worktree and commit. */
  contained: boolean;
  /** Files `changedFiles` reports for every worktree. */
  changed: string[];
  /** The unified patch `diff` reports for every worktree. */
  patch: string;
  /** The commit every worktree reports as its head. */
  headSha: string;
  failCreate: Error | null;
  /** Makes `remove` throw, as a locked file does on Windows. */
  failRemove: Error | null;
}

export function createFakeWorktrees(): FakeWorktrees {
  const live = new Map<string, string>();
  const fake: FakeWorktrees = {
    created: [],
    removed: [],
    removedBranches: [],
    commits: [],
    merges: [],
    mergeResult: { kind: 'up_to_date' },
    contained: true,
    changed: ['src/a.ts'],
    patch: '',
    headSha: 'head-sha-1',
    failCreate: null,
    failRemove: null,
    async create(ticketId: TicketId, branch, baseRef) {
      if (fake.failCreate) {
        throw fake.failCreate;
      }

      const path = `/repo/.worktrees/${ticketId}`;
      if (!live.has(path)) {
        fake.created.push({ ticketId, branch, baseRef, path });
      }

      live.set(path, branch);

      return { path, baseSha: 'base-sha-1' };
    },
    async remove(path, opts) {
      if (fake.failRemove) {
        throw fake.failRemove;
      }

      live.delete(path);
      fake.removed.push(path);
      if (opts?.deleteBranch !== undefined) {
        fake.removedBranches.push(opts.deleteBranch);
      }
    },
    changedFiles: async () => [...fake.changed],
    diff: async () => ({
      files: fake.changed.map((path) => ({ status: 'M' as const, path })),
      patch: fake.patch,
    }),
    async commitAll(path, message) {
      fake.commits.push({ path, message });

      return 'commit-sha-1';
    },
    head: async () => fake.headSha,
    rootOf: (path) => path,
    untracked: async () => [],
    readPrep: async () => null,
    writePrep: async () => undefined,
    async mergeIn(path, sha, message) {
      fake.merges.push({ path, sha, message });

      return fake.mergeResult;
    },
    contains: async () => fake.contained,
  };

  return fake;
}

export function createFakeMemory(): MemorySource & {
  calls: string[];
  filters: (MemoryFilter | undefined)[];
} {
  const calls: string[] = [];
  const filters: (MemoryFilter | undefined)[] = [];

  return {
    calls,
    filters,
    async slice(slug, filter) {
      calls.push(slug);
      filters.push(filter);
      const all = {
        decisions: [{ id: 'd-0001', statement: 'Use pnpm.', tags: ['tooling'] }],
        rejected: [{ id: 'r-0001', statement: 'No vector memory.', tags: ['memory'] }],
      };

      return filter ? filterMemorySlice(all, filter) : all;
    },
  };
}

export interface FakeReceipts extends ReceiptLog {
  /** Sets the chain the run "produced"; the last receipt's hash becomes final_chain_hash. */
  setChain(runId: string, lastHash: string): void;
  /** Sets the receipts the run's chain holds, as the app's resume link would leave them. */
  setReceipts(runId: string, receipts: readonly unknown[]): void;
}

export function createFakeReceipts(): FakeReceipts {
  const chains = new Map<string, readonly Receipt[]>();

  return {
    setChain(runId, lastHash) {
      chains.set(runId, [{ hash: lastHash } as unknown as Receipt]);
    },
    setReceipts(runId, receipts) {
      chains.set(runId, receipts as readonly Receipt[]);
    },
    async append() {
      throw new Error('the engine never appends receipts');
    },
    async list(runId) {
      return chains.get(runId) ?? [];
    },
  };
}

export interface FakeClock extends Clock {
  advance(ms: number): void;
  /** Epoch ms of every timer `after` set and neither fired nor cancelled, soonest first. */
  pendingAt(): number[];
  /** Runs the timers that are due at the current time (`advance` does not, so older tests keep their meaning). */
  fireDue(): void;
}

export function createFakeClock(start = Date.UTC(2026, 9, 13, 12, 0, 0)): FakeClock {
  let current = start;
  const timers = new Set<{ at: number; fn: () => void }>();

  return {
    now: () => current,
    after(ms, fn) {
      const timer = { at: current + ms, fn };
      timers.add(timer);

      return () => void timers.delete(timer);
    },
    advance(ms) {
      current += ms;
    },
    pendingAt: () => [...timers].map((t) => t.at).sort((a, b) => a - b),
    fireDue() {
      for (const timer of [...timers]) {
        if (timer.at <= current) {
          timers.delete(timer);
          timer.fn();
        }
      }
    },
  };
}

export function createIds(): IdSource {
  const n = { run: 0, wake: 0, interaction: 0, token: 0 };

  return {
    runId: () => `run-${++n.run}`,
    wakeId: () => `wake-${++n.wake}`,
    interactionId: () => `int-${++n.interaction}`,
    token: () => `token-${++n.token}-${'x'.repeat(40)}`,
  };
}

export interface FakeReports extends ReportStore {
  readonly saved: { runId: string; name: string; text: string }[];
}

export function createFakeReports(): FakeReports {
  const saved: FakeReports['saved'] = [];

  return {
    saved,
    async put(runId, name, text) {
      saved.push({ runId, name, text });

      return `mem://${runId}/${name}`;
    },
  };
}
