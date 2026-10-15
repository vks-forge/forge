/**
 * Secret retirement: which finished runs lose their receipt secrets, and when.
 *
 * Why: run secrets stay in the SecretStore for the life of the run so G1 can verify its
 *   receipts after a restart (d-0100), and a secret that outlives its run is a standing key
 *   for forging that run's chain. The rule has to be exact in both directions: a run that is
 *   alive, interrupted and waiting for its resume, or finished but not yet judged by the
 *   gates must keep its secrets (deleting them would make the next G1 run fail for no
 *   reason), and every other run must lose them, including secrets of runs the database no
 *   longer knows (left by a crash or a wiped database).
 *
 * Pins: kept for starting, running, settling and interrupted runs and for a successful run
 *   whose ticket is still gating it; retired for every other outcome, for a run whose ticket
 *   moved on, and for unknown runs; a failing store is logged and does not throw.
 * Depends on: src/services/secret-retirement, @forge/db (memory), @forge/hooks, @forge/secrets.
 *   No IO.
 */

import type { Run, Ticket } from '@forge/core';
import { createMemoryStorage } from '@forge/db';
import { createRunSecretRegistry } from '@forge/hooks';
import { createMemorySecretStore } from '@forge/secrets';
import { describe, expect, it, vi } from 'vitest';
import { createSecretRetirement } from '#/services/secret-retirement.js';

const T = '2026-10-14T00:00:00.000Z';

const ticket = (over: Partial<Ticket> = {}): Ticket => ({
  id: 'FX-1' as Ticket['id'],
  project: 'fixture',
  title: 't',
  body: 'b',
  type: 'feat',
  lane: 'express',
  tier_predicted: 'A',
  status: 'in_progress',
  status_version: 1,
  rework_count: 0,
  created_at: T,
  updated_at: T,
  blocked_by: [],
  priority: 0,
  ...over,
});

const run = (id: string, over: Partial<Run> = {}): Run => ({
  id,
  ticket_id: 'FX-1',
  harness: 'h',
  driver_version: '1',
  cwd: '/w',
  lane: 'express',
  started_at: T,
  status: 'running',
  owner: 'srv',
  ...over,
});

async function rig(rows: { run: Run; ticket?: Partial<Ticket> }[] = []) {
  const storage = createMemoryStorage();
  const store = createMemorySecretStore();
  const registry = createRunSecretRegistry({ store });
  const log = vi.fn();
  await storage.transaction(async (tx) => {
    const first = rows[0];
    if (first) {
      await tx.tickets.insert(ticket(first.ticket));
    }

    for (const r of rows) {
      await tx.runs.insert(r.run);
    }
  });

  for (const r of rows) {
    await registry.register(r.run.id, 'token');
  }

  return {
    storage,
    store,
    registry,
    log,
    retirement: createSecretRetirement({ storage, registry, log }),
  };
}

describe('secret retirement', () => {
  it.each(['starting', 'running', 'settling', 'interrupted'] as const)(
    'keeps the secrets of a %s run',
    async (status) => {
      const { retirement, store } = await rig([{ run: run('run-1', { status }) }]);

      expect(await retirement.sweep()).toBe(0);
      expect(await store.list('run/')).toEqual(['run/run-1/secret-g1']);
    },
  );

  it.each(['error', 'cancelled', 'timeout', 'refused', 'max_turns', 'settled'] as const)(
    'retires the secrets of a run that ended as %s',
    async (status) => {
      const { retirement, store } = await rig([
        { run: run('run-1', { status, ended_at: T }) },
      ]);

      expect(await retirement.sweep()).toBe(1);
      expect(await store.list('run/')).toEqual([]);
    },
  );

  it.each(['verifying', 'review', 'needs_signoff'] as const)(
    'keeps a successful run while its ticket is %s and the gates may still judge it',
    async (status) => {
      const { retirement, store } = await rig([
        {
          run: run('run-1', { status: 'success', ended_at: T }),
          ticket: { status, assignee_run_id: 'run-1' },
        },
      ]);

      expect(await retirement.sweep()).toBe(0);
      expect(await store.list('run/')).toEqual(['run/run-1/secret-g1']);
    },
  );

  it.each(['done', 'cancelled', 'in_progress', 'waiting_human'] as const)(
    'retires a successful run once its ticket is %s',
    async (status) => {
      const { retirement, store } = await rig([
        {
          run: run('run-1', { status: 'success', ended_at: T }),
          ticket: { status, assignee_run_id: 'run-1' },
        },
      ]);

      expect(await retirement.sweep()).toBe(1);
      expect(await store.list('run/')).toEqual([]);
    },
  );

  it('retires a successful run whose ticket is gating a later run', async () => {
    const { retirement, store } = await rig([
      {
        run: run('run-1', { status: 'success', ended_at: T }),
        ticket: { status: 'verifying', assignee_run_id: 'run-2' },
      },
    ]);

    expect(await retirement.sweep()).toBe(1);
    expect(await store.list('run/')).toEqual([]);
  });

  it('retires every generation of a run, and the secrets of runs the database does not know', async () => {
    const { retirement, store, registry } = await rig([
      { run: run('run-1', { status: 'error', ended_at: T }) },
    ]);

    await registry.register('run-1', 'token-2', 2);
    await registry.register('run-ghost', 'token');

    expect(await retirement.sweep()).toBe(2);
    expect(await store.list('run/')).toEqual([]);
  });

  it('never touches secrets outside run/', async () => {
    const { retirement, store } = await rig([
      { run: run('run-1', { status: 'error', ended_at: T }) },
    ]);

    await store.put('github/acme/key', new Uint8Array([1]));
    await retirement.sweep();

    expect(await store.list('')).toEqual(['github/acme/key']);
  });

  it('logs a failing store instead of throwing, and reports nothing retired', async () => {
    const { retirement, log, registry } = await rig([
      { run: run('run-1', { status: 'error', ended_at: T }) },
    ]);

    vi.spyOn(registry, 'sweep').mockRejectedValue(new Error('store offline'));

    await expect(retirement.sweep()).resolves.toBe(0);
    expect(log).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('could not retire'),
      expect.objectContaining({ error: 'Error: store offline' }),
    );
  });
});
