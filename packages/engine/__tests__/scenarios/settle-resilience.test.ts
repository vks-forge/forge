/**
 * Scenario: a run that fails to settle never blocks the others or stays stuck unseen, and a
 * finished card that gets new work is live again.
 *
 * Why: on the live server a Worker run ended with `policy_denied`; reading its receipts inside the
 *   settle transaction re-entered the writer lock, so every tick threw, the run stayed
 *   `settling`, its ticket `in_progress` and a second run behind it was never looked at. The
 *   same pass also left card DCP-C2 `done` after the chat filed two tickets on it. A settle must
 *   use the transaction it was given, one run's fault must stay its own (and end in a parked
 *   ticket with an escalation after repeated failures), and new work reopens a done card.
 *
 * Pins: a `policy_denied` end settles, parks and escalates without opening a second writer
 *   inside the settle transaction; a run whose settle keeps throwing is logged per run, does not
 *   stop the next run settling, and after three failures is closed as an error with its ticket
 *   parked and a pending failure escalation; a restart resumes a `settling` run and an orphaned
 *   `running` run; a ticket filed on a `done` card moves it to `in_progress`.
 * Depends on: helpers/rig, helpers/resume, helpers/scripted-driver, src/tick/ticket-insert, vitest.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { InvalidInputError } from '@forge/core';
import type { StorageAdapter, StorageTx } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { insertInboxTicket } from '#/tick/ticket-insert.js';
import { getRun } from '#tests/helpers/resume.js';
import { makeRig } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';
import { makeResult } from '#tests/helpers/scripted-driver.js';

const TWO_SLOTS = {
  engine: { max_concurrent_global: 2, max_concurrent_per_project: 2 },
};

/**
 * Makes the rig behave like the SQLite adapter: a receipt read from inside a storage
 * transaction is a re-entrant call (one writer lock), and `failRevoke` ids make the settle
 * transaction throw for those runs.
 */
function sqliteLike(rig: Rig): { failRevoke: Set<string> } {
  const inside = new AsyncLocalStorage<true>();
  const failRevoke = new Set<string>();
  const inner: StorageAdapter = rig.storage;
  const faulty = (tx: StorageTx): StorageTx =>
    new Proxy(tx, {
      get(target, key) {
        const value = Reflect.get(target, key) as unknown;
        if (key !== 'runTokens') {
          return value;
        }

        const tokens = value as StorageTx['runTokens'];

        return new Proxy(tokens, {
          get(t, m) {
            const member = Reflect.get(t, m) as unknown;
            if (m === 'revoke') {
              return async (id: string, at: string) => {
                if (failRevoke.has(id)) {
                  throw new Error(`disk fault settling ${id}`);
                }

                return tokens.revoke(id, at);
              };
            }

            return typeof member === 'function'
              ? (member as (...a: unknown[]) => unknown).bind(t)
              : member;
          },
        });
      },
    });

  const storage: StorageAdapter = {
    ...inner,
    transaction: (fn) =>
      inside.run(true, () => inner.transaction((tx) => fn(faulty(tx)))),
  };

  const receipts = rig.deps.receipts;
  Object.assign(rig.deps, {
    storage,
    receipts: {
      ...receipts,
      list: (runId: string) => {
        if (inside.getStore() === true) {
          throw new InvalidInputError(
            're-entrant call: receipt read inside a transaction',
          );
        }

        return receipts.list(runId);
      },
    },
  });

  return { failRevoke };
}

describe('settle: a policy_denied end', () => {
  it('settles, parks the ticket and escalates without a nested writer', async () => {
    const rig = await makeRig();
    sqliteLike(rig);
    const id = await rig.request('Fix the doctor check');
    await rig.tick();
    rig.driver.finish(
      'run-1',
      makeResult({ status: 'error', errorFamily: 'policy_denied' }),
    );

    await rig.flush();
    const report = await rig.tick();

    expect(report.errors).toEqual([]);
    expect((await getRun(rig, 'run-1'))?.status).toBe('error');
    expect((await rig.ticket(id)).status).toBe('waiting_human');
    const pending = await rig.storage.transaction((tx) => tx.interactions.listPending());
    expect(pending.filter((p) => p.ticket_id === id)).toHaveLength(1);
  });
});

describe('settle: one failing run', () => {
  async function twoRuns() {
    const rig = await makeRig(TWO_SLOTS);
    const fault = sqliteLike(rig);
    const a = await rig.request('First task');
    const b = await rig.request('Second task');
    await rig.tick();
    expect(rig.driver.starts.map((s) => s.runId)).toEqual(['run-1', 'run-2']);

    return { rig, fault, a, b };
  }

  it('settles the other run in the same tick and logs the failing run id', async () => {
    const { rig, fault, b } = await twoRuns();
    fault.failRevoke.add('run-1');
    rig.driver.finish('run-1', makeResult());
    rig.driver.finish('run-2', makeResult());
    await rig.flush();

    const report = await rig.tick();

    expect(report.errors.map((e) => e.where)).toContain('settle run-1');
    expect(rig.logs.some((l) => l.message.includes('run-1') && l.level === 'error')).toBe(
      true,
    );

    expect((await getRun(rig, 'run-2'))?.status).toBe('success');
    expect((await rig.ticket(b)).status).not.toBe('in_progress');
  });

  it('closes the run as an error and parks its ticket with an escalation after three failures', async () => {
    const { rig, fault, a } = await twoRuns();
    fault.failRevoke.add('run-1');
    rig.driver.finish('run-1', makeResult());
    await rig.flush();

    await rig.tick();
    await rig.tick();
    expect((await rig.ticket(a)).status).toBe('in_progress');
    await rig.tick();

    expect((await getRun(rig, 'run-1'))?.status).toBe('error');
    const ticket = await rig.ticket(a);
    expect(ticket.status).toBe('waiting_human');
    expect(ticket.blocked_reason).toContain('could not settle run run-1');
    const pending = await rig.storage.transaction((tx) => tx.interactions.listPending());
    expect(pending.filter((p) => p.ticket_id === a && p.kind === 'failure')).toHaveLength(
      1,
    );
  });
});

describe('restart: a stuck settle and an orphaned run', () => {
  it('resumes both from their sessions instead of leaving them behind', async () => {
    const rig = await makeRig(TWO_SLOTS);
    const a = await rig.request('First task');
    const b = await rig.request('Second task');
    await rig.tick();
    rig.driver.emit('run-1', { type: 'session', session_ref: 'sess-A' });
    rig.driver.emit('run-2', { type: 'session', session_ref: 'sess-B' });
    await rig.flush();
    await rig.storage.transaction((tx) =>
      tx.runs.update('run-1', { status: 'settling' }),
    );

    const report = await rig.restart('srv-b').tick();

    expect([...report.resumed].sort()).toEqual(['run-1', 'run-2']);
    expect(await getRun(rig, 'run-1')).toMatchObject({
      status: 'running',
      owner: 'srv-b',
    });

    expect(await getRun(rig, 'run-2')).toMatchObject({
      status: 'running',
      owner: 'srv-b',
    });

    expect((await rig.ticket(a)).status).toBe('in_progress');
    expect((await rig.ticket(b)).status).toBe('in_progress');
  });
});

describe('a finished card with new work', () => {
  it('moves back to in_progress when a ticket is filed on it', async () => {
    const rig = await makeRig();
    const id = await rig.request('Fix the doctor check');
    const cardId = (await rig.ticket(id)).card_id!;
    const at = new Date(rig.clock.now()).toISOString();
    await rig.storage.transaction(async (tx) => {
      const card = (await tx.cards.get(cardId))!;
      await tx.cards.updatePhase(cardId, card.phase_version, {
        phase: 'done',
        needs_you: false,
        updated_at: at,
      });
    });

    await rig.storage.transaction(async (tx) => {
      await insertInboxTicket(tx, (await tx.projects.get('forge'))!, {
        cardId,
        title: 'Follow-up',
        body: 'More work',
        type: 'fix',
        at,
        actor: { type: 'director', id: 'engine' },
      });
    });

    const card = await rig.storage.transaction((tx) => tx.cards.get(cardId));
    expect(card?.phase).toBe('in_progress');
  });
});
