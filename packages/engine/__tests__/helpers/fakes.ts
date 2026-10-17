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
  ReportStore,
  TicketId,
  WorktreeManager,
} from '@forge/core';
import type { Receipt, ReceiptLog } from '@forge/tools';
import type { IdSource } from '#/types/engine.types.js';

export interface FakeWorktrees extends WorktreeManager {
  readonly created: { ticketId: string; branch: string; baseRef: string; path: string }[];
  readonly removed: string[];
  readonly commits: { path: string; message: string }[];
  /** Files `changedFiles` reports for every worktree. */
  changed: string[];
  /** The commit every worktree reports as its head. */
  headSha: string;
  failCreate: Error | null;
}

export function createFakeWorktrees(): FakeWorktrees {
  const live = new Map<string, string>();
  const fake: FakeWorktrees = {
    created: [],
    removed: [],
    commits: [],
    changed: ['src/a.ts'],
    headSha: 'head-sha-1',
    failCreate: null,
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
    async remove(path) {
      live.delete(path);
      fake.removed.push(path);
    },
    changedFiles: async () => [...fake.changed],
    diff: async () => ({
      files: fake.changed.map((path) => ({ status: 'M' as const, path })),
      patch: '',
    }),
    async commitAll(path, message) {
      fake.commits.push({ path, message });

      return 'commit-sha-1';
    },
    head: async () => fake.headSha,
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
}

export function createFakeClock(start = Date.UTC(2026, 9, 13, 12, 0, 0)): FakeClock {
  let current = start;

  return {
    now: () => current,
    after: () => () => undefined,
    advance(ms) {
      current += ms;
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
