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
 *   FakeClock, createFakeClock(), createIds().
 * Depends on: @forge/core, @forge/tools (types). No IO.
 */

import type { Clock, MemorySource, TicketId, WorktreeManager } from '@forge/core';
import type { Receipt, ReceiptLog } from '@forge/tools';
import type { IdSource } from '#/types/engine.types.js';

export interface FakeWorktrees extends WorktreeManager {
  readonly created: { ticketId: string; branch: string; baseRef: string; path: string }[];
  readonly removed: string[];
  readonly commits: { path: string; message: string }[];
  /** Files `changedFiles` reports for every worktree. */
  changed: string[];
  failCreate: Error | null;
}

export function createFakeWorktrees(): FakeWorktrees {
  const live = new Map<string, string>();
  const fake: FakeWorktrees = {
    created: [],
    removed: [],
    commits: [],
    changed: ['src/a.ts'],
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
    head: async () => 'head-sha-1',
  };

  return fake;
}

export function createFakeMemory(): MemorySource & { calls: string[] } {
  const calls: string[] = [];

  return {
    calls,
    async slice(slug) {
      calls.push(slug);

      return {
        decisions: [{ id: 'd-0001', statement: 'Use pnpm.' }],
        rejected: [{ id: 'r-0001', statement: 'No vector memory.' }],
      };
    },
  };
}

export interface FakeReceipts extends ReceiptLog {
  /** Sets the chain the run "produced"; the last receipt's hash becomes final_chain_hash. */
  setChain(runId: string, lastHash: string): void;
}

export function createFakeReceipts(): FakeReceipts {
  const chains = new Map<string, readonly Receipt[]>();

  return {
    setChain(runId, lastHash) {
      chains.set(runId, [{ hash: lastHash } as unknown as Receipt]);
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
