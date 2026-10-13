/**
 * StorageAdapter contract: one suite every storage backend must pass.
 *
 * Why: the Director must behave identically on any backend, so this suite is the
 *   executable definition of StorageAdapter and every backend must pass it. It pins the
 *   properties engine correctness rests on: a stale writer must lose the CAS race (or
 *   two Director ticks could double-dispatch a ticket), a throw rolls back every write
 *   in the transaction (or a ticket could move without its run row), concurrent
 *   transactions serialize, intake duplicates are dropped per source, run events are
 *   numbered by storage alone (two writers on one run, the driver and the MCP server,
 *   can never collide or leave a gap), run tokens exist only as revocable hashes (a
 *   leaked database file must not yield a usable credential), and only pending
 *   interactions are listed (director-core.md §3, §7, §8).
 *
 * The newer repositories live in their own files and are registered from here, so every
 *   backend runs them: ticket relations and the ticket fields derived from them, the run
 *   lifecycle, interaction answer/expire CAS, intake ids and ticket mapping, wake requests,
 *   the run inbox, gate results and projects (ports batch C).
 *
 * Also pinned: optional columns can be cleared (a patch from `transition()` leaves no stale
 *   `blocked_reason` / `tier_actual`), the CAS owns `status_version`, a transaction
 *   callback that re-enters the adapter fails fast instead of deadlocking, backend
 *   failures surface as typed ForgeErrors, and a revoked run token cannot be re-armed by
 *   `issue`.
 *
 * Exports: describeStorageContract().
 * Depends on: vitest, @forge/core, helpers/fixtures, the sibling *.contract files. IO only
 *   through the adapter under test.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ForgeError,
  InvalidInputError,
  PolicyDeniedError,
  toTicketPatch,
  transition,
} from '@forge/core';
import type { StorageAdapter, TicketEvent } from '@forge/core';
import {
  makeInteraction,
  makeIntake,
  makeRun,
  makeTextEvent,
  makeTicket,
} from '#tests/helpers/fixtures.js';
import { describeInteractionCasContract } from './interaction-cas.contract.js';
import { describeIntakeEventsContract } from './intake-events.contract.js';
import { describeRunLifecycleContract } from './run-lifecycle.contract.js';
import { describeTicketRelationsContract } from './ticket-relations.contract.js';
import { describeWakeRequestsContract } from './wake-requests.contract.js';
import { describeWorkQueuesContract } from './work-queues.contract.js';

/** Register the shared contract; `makeAdapter` must return a fresh, empty adapter each call. */
export function describeStorageContract(
  name: string,
  makeAdapter: () => Promise<StorageAdapter> | StorageAdapter,
): void {
  describe(`StorageAdapter contract: ${name}`, () => {
    let db: StorageAdapter;
    beforeEach(async () => {
      db = await makeAdapter();
    });

    afterEach(async () => {
      await db.close();
    });

    describeTicketRelationsContract(() => db);
    describeRunLifecycleContract(() => db);
    describeInteractionCasContract(() => db);
    describeIntakeEventsContract(() => db);
    describeWakeRequestsContract(() => db);
    describeWorkQueuesContract(() => db);

    describe('tickets', () => {
      it('inserts and reads back a ticket, null when absent', async () => {
        const t = makeTicket(1, { blocked_by: [makeTicket(2).id], tier_actual: 'B' });
        await db.transaction((tx) => tx.tickets.insert(t));
        const got = await db.transaction((tx) => tx.tickets.get(t.id));
        const missing = await db.transaction((tx) => tx.tickets.get(makeTicket(9).id));
        expect(got).toEqual(t);
        expect(missing).toBeNull();
      });

      it('lists tickets by status in insertion order', async () => {
        await db.transaction(async (tx) => {
          await tx.tickets.insert(makeTicket(1));
          await tx.tickets.insert(makeTicket(2, { status: 'planned' }));
          await tx.tickets.insert(makeTicket(3));
        });

        const inbox = await db.transaction((tx) => tx.tickets.listByStatus('inbox'));
        expect(inbox.map((t) => t.id)).toEqual([makeTicket(1).id, makeTicket(3).id]);
      });

      it('rejects a duplicate id', async () => {
        await db.transaction((tx) => tx.tickets.insert(makeTicket(1)));
        const failure = await db
          .transaction((tx) => tx.tickets.insert(makeTicket(1)))
          .catch((e: unknown) => e);

        expect(failure).toBeInstanceOf(InvalidInputError);
      });

      it('never leaks a raw ZodError: an invalid ticket is an InvalidInputError with the cause', async () => {
        const bad = makeTicket(1, { lane: 'nope' as never });
        const failure = await db
          .transaction((tx) => tx.tickets.insert(bad))
          .catch((e: unknown) => e);

        expect(failure).toBeInstanceOf(InvalidInputError);
        expect((failure as ForgeError).cause).toBeDefined();
        expect((failure as ForgeError).errorFamily).toBe('invalid_input');
      });

      it('CAS succeeds on the current version, applies the patch and bumps the version', async () => {
        const t = makeTicket(1);
        await db.transaction((tx) => tx.tickets.insert(t));
        const ok = await db.transaction((tx) =>
          tx.tickets.updateTicketCas(t.id, 0, { status: 'planned', rework_count: 1 }),
        );

        const got = await db.transaction((tx) => tx.tickets.get(t.id));
        expect(ok).toBe(true);
        expect(got).toMatchObject({
          status: 'planned',
          rework_count: 1,
          status_version: 1,
        });
      });

      it('CAS refuses a caller-supplied status_version and leaves the row untouched', async () => {
        const t = makeTicket(1);
        await db.transaction((tx) => tx.tickets.insert(t));
        const patch = { status: 'planned', status_version: 5 } as never;
        const failure = await db
          .transaction((tx) => tx.tickets.updateTicketCas(t.id, 0, patch))
          .catch((e: unknown) => e);

        const got = await db.transaction((tx) => tx.tickets.get(t.id));
        expect(failure).toBeInstanceOf(InvalidInputError);
        expect(got).toMatchObject({ status: 'inbox', status_version: 0 });
      });

      it('CAS always sets status_version to expected + 1', async () => {
        const t = makeTicket(1, { status_version: 7 });
        await db.transaction((tx) => tx.tickets.insert(t));
        await db.transaction((tx) =>
          tx.tickets.updateTicketCas(t.id, 7, { rework_count: 2 }),
        );

        const got = await db.transaction((tx) => tx.tickets.get(t.id));
        expect(got?.status_version).toBe(8);
      });

      it('CAS clears an optional column when the patch carries it as undefined', async () => {
        const t = makeTicket(1, { blocked_reason: 'dep', tier_actual: 'B' });
        await db.transaction((tx) => tx.tickets.insert(t));
        await db.transaction((tx) =>
          tx.tickets.updateTicketCas(t.id, 0, {
            blocked_reason: undefined,
            tier_actual: undefined,
          }),
        );

        const got = await db.transaction((tx) => tx.tickets.get(t.id));
        expect(got).not.toBeNull();
        expect('blocked_reason' in (got ?? {})).toBe(false);
        expect('tier_actual' in (got ?? {})).toBe(false);
      });

      it('blocked then unblocked via transition() leaves no blocked_reason in the stored row', async () => {
        const start = makeTicket(1, { status: 'in_progress' });
        await db.transaction((tx) => tx.tickets.insert(start));
        const at = '2026-10-13T01:00:00.000Z';
        let cur = start;
        for (const e of [
          { type: 'blocked', at, reason: 'waiting on dep' },
          { type: 'unblocked', at },
        ] as TicketEvent[]) {
          const r = transition(cur, e);
          if (!r.ok) {
            throw new Error('unexpected transition error');
          }

          const next = r.value;
          const ok = await db.transaction((tx) =>
            tx.tickets.updateTicketCas(cur.id, cur.status_version, toTicketPatch(next)),
          );

          expect(ok).toBe(true);
          cur = next;
          const stored = await db.transaction((tx) => tx.tickets.get(cur.id));
          expect(stored).toEqual(cur);
          expect('blocked_reason' in (stored ?? {})).toBe(e.type === 'blocked');
        }
      });

      it('a stale tier_actual is cleared when the gate fails (no merge on an old pass)', async () => {
        const at = '2026-10-13T01:00:00.000Z';
        let cur = makeTicket(1, { status: 'in_progress' });
        await db.transaction((tx) => tx.tickets.insert(cur));
        for (const e of [
          { type: 'verifying', at },
          { type: 'gate_passed', at, tier_actual: 'A' },
          { type: 'gate_failed', at },
        ] as TicketEvent[]) {
          const r = transition(cur, e);
          if (!r.ok) {
            throw new Error('unexpected transition error');
          }

          const next = r.value;
          await db.transaction((tx) =>
            tx.tickets.updateTicketCas(cur.id, cur.status_version, toTicketPatch(next)),
          );

          cur = next;
        }

        const stored = await db.transaction((tx) => tx.tickets.get(cur.id));
        expect(stored?.status).toBe('in_progress');
        expect('tier_actual' in (stored ?? {})).toBe(false);
      });

      it('CAS fails on a stale version and leaves the row untouched', async () => {
        const t = makeTicket(1);
        await db.transaction((tx) => tx.tickets.insert(t));
        await db.transaction((tx) =>
          tx.tickets.updateTicketCas(t.id, 0, { status: 'planned' }),
        );

        const stale = await db.transaction((tx) =>
          tx.tickets.updateTicketCas(t.id, 0, { status: 'cancelled' }),
        );

        const got = await db.transaction((tx) => tx.tickets.get(t.id));
        expect(stale).toBe(false);
        expect(got?.status).toBe('planned');
      });

      it('CAS returns false for an unknown ticket', async () => {
        const ok = await db.transaction((tx) =>
          tx.tickets.updateTicketCas(makeTicket(7).id, 0, { status: 'planned' }),
        );

        expect(ok).toBe(false);
      });
    });

    describe('transactions', () => {
      it('commits on success and returns the callback value', async () => {
        const v = await db.transaction(async (tx) => {
          await tx.tickets.insert(makeTicket(1));

          return 42;
        });

        const got = await db.transaction((tx) => tx.tickets.get(makeTicket(1).id));
        expect(v).toBe(42);
        expect(got).not.toBeNull();
      });

      it('rolls back every write and rethrows when the callback throws', async () => {
        const boom = new Error('boom');
        await expect(
          db.transaction(async (tx) => {
            await tx.tickets.insert(makeTicket(1));
            await tx.runs.insert(makeRun('r1'));
            await tx.runEvents.append('r1', makeTextEvent());
            await tx.intakeEvents.insertIfNew(makeIntake('k'));
            throw boom;
          }),
        ).rejects.toBe(boom);

        const after = await db.transaction(async (tx) => ({
          ticket: await tx.tickets.get(makeTicket(1).id),
          run: await tx.runs.get('r1'),
          events: await tx.runEvents.listByRun('r1'),
          intake: (await tx.intakeEvents.insertIfNew(makeIntake('k'))).inserted,
        }));

        expect(after).toEqual({ ticket: null, run: null, events: [], intake: true });
      });

      it('fails fast, not deadlocks, when the callback re-enters transaction()', async () => {
        const outcome = await Promise.race([
          db
            .transaction(async (tx) => {
              await tx.tickets.insert(makeTicket(1));
              await Promise.resolve();
              await db.transaction((inner) => inner.tickets.insert(makeTicket(2)));
            })
            .catch((e: unknown) => e),
          new Promise((r) => setTimeout(() => r('deadlock'), 1000)),
        ]);

        expect(outcome).toBeInstanceOf(InvalidInputError);
        expect(String((outcome as Error).message)).toMatch(/re-entr|nested/i);
        // the outer transaction rolled back and the adapter is still usable
        const after = await db.transaction(async (tx) => ({
          one: await tx.tickets.get(makeTicket(1).id),
          two: await tx.tickets.get(makeTicket(2).id),
        }));

        expect(after).toEqual({ one: null, two: null });
      });

      it('serializes concurrent transactions (single writer)', async () => {
        const order: string[] = [];
        const slow = db.transaction(async (tx) => {
          order.push('a:start');
          await tx.tickets.insert(makeTicket(1));
          await new Promise((r) => setTimeout(r, 20));
          order.push('a:end');
        });

        const fast = db.transaction(async (tx) => {
          order.push('b:start');
          await tx.tickets.insert(makeTicket(2));
          order.push('b:end');
        });

        await Promise.all([slow, fast]);
        expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
      });
    });

    describe('runs', () => {
      it('round-trips a run, lists by ticket and applies updates', async () => {
        await db.transaction(async (tx) => {
          await tx.runs.insert(makeRun('r1'));
          await tx.runs.insert(makeRun('r2', { ticket_id: 'SF-2' }));
          await tx.runs.update('r1', {
            status: 'success',
            ended_at: '2026-10-13T01:00:00.000Z',
            cost_usd: 0.5,
            usage: { in: 1, out: 2, cachedIn: 3, cacheWrite: 4 },
          });
        });

        const { r1, list } = await db.transaction(async (tx) => ({
          r1: await tx.runs.get('r1'),
          list: await tx.runs.listByTicket('SF-1'),
        }));

        expect(r1).toMatchObject({
          status: 'success',
          cost_usd: 0.5,
          usage: { in: 1, out: 2, cachedIn: 3, cacheWrite: 4 },
        });

        expect(list.map((r) => r.id)).toEqual(['r1']);
      });
    });

    describe('optional run columns', () => {
      it('update clears an optional column given as undefined', async () => {
        await db.transaction(async (tx) => {
          await tx.runs.insert(makeRun('r1', { error_family: 'crash', cost_usd: 1 }));
          await tx.runs.update('r1', { error_family: undefined });
        });

        const got = await db.transaction((tx) => tx.runs.get('r1'));
        expect('error_family' in (got ?? {})).toBe(false);
        expect(got?.cost_usd).toBe(1);
      });

      it('update refuses to clear a required column', async () => {
        await db.transaction((tx) => tx.runs.insert(makeRun('r1')));
        const failure = await db
          .transaction((tx) => tx.runs.update('r1', { harness: undefined } as never))
          .catch((e: unknown) => e);

        expect(failure).toBeInstanceOf(InvalidInputError);
      });
    });

    describe('run events', () => {
      it('round-trips a tool_call / tool_result whose unknown payload is undefined', async () => {
        const call = {
          type: 'tool_call' as const,
          ts: '2026-10-13T00:00:00.000Z',
          call_id: 'c1',
          name: 'noop',
          input: undefined,
        };

        const result = {
          type: 'tool_result' as const,
          ts: '2026-10-13T00:00:01.000Z',
          call_id: 'c1',
          output: undefined,
          is_error: false,
        };

        const stored = await db.transaction(async (tx) => [
          await tx.runEvents.append('r1', call),
          await tx.runEvents.append('r1', result),
        ]);

        const listed = await db.transaction((tx) => tx.runEvents.listByRun('r1'));
        expect(listed).toStrictEqual(stored);
        expect(listed[0]).toMatchObject({ input: null });
        expect(listed[1]).toMatchObject({ output: null });
      });

      it('allocates seq from 0, contiguous per run, and returns the stored event', async () => {
        const out = await db.transaction(async (tx) => ({
          a0: await tx.runEvents.append('r1', makeTextEvent('a')),
          a1: await tx.runEvents.append('r1', makeTextEvent('b')),
          b0: await tx.runEvents.append('r2', makeTextEvent('other')),
        }));

        const all = await db.transaction((tx) => tx.runEvents.listByRun('r1'));
        expect(out.a0).toMatchObject({ seq: 0, text: 'a' });
        expect(out.a1.seq).toBe(1);
        expect(out.b0.seq).toBe(0);
        expect(all).toEqual([out.a0, out.a1]);
      });

      it('continues after the highest stored seq across transactions', async () => {
        await db.transaction((tx) => tx.runEvents.append('r1', makeTextEvent()));
        const next = await db.transaction((tx) =>
          tx.runEvents.append('r1', makeTextEvent()),
        );

        expect(next.seq).toBe(1);
      });

      it('gives two concurrent writers distinct, gap-free seqs', async () => {
        const writer = (tag: string) =>
          Promise.all(
            Array.from({ length: 5 }, (_, i) =>
              db.transaction((tx) =>
                tx.runEvents.append('r1', makeTextEvent(`${tag}${i}`)),
              ),
            ),
          );

        await Promise.all([writer('driver-'), writer('mcp-')]);
        const all = await db.transaction((tx) => tx.runEvents.listByRun('r1'));
        expect(all.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(new Set(all.map((e) => (e as { text: string }).text)).size).toBe(10);
      });

      it('ignores a seq smuggled in by the caller; storage owns numbering', async () => {
        const smuggled = { ...makeTextEvent('x'), seq: 99 } as never;
        const stored = await db.transaction((tx) => tx.runEvents.append('r1', smuggled));
        expect(stored.seq).toBe(0);
      });

      it('returns only events after afterSeq', async () => {
        await db.transaction(async (tx) => {
          for (let i = 0; i < 4; i++) {
            await tx.runEvents.append('r1', makeTextEvent());
          }
        });

        const tail = await db.transaction((tx) => tx.runEvents.listByRun('r1', 1));
        expect(tail.map((e) => e.seq)).toEqual([2, 3]);
      });

      it('rejects an invalid event without consuming a seq', async () => {
        const bad = { type: 'text', ts: 'not-a-date', text: 'x' } as never;
        await expect(
          db.transaction((tx) => tx.runEvents.append('r1', bad)),
        ).rejects.toThrow();

        const ok = await db.transaction((tx) =>
          tx.runEvents.append('r1', makeTextEvent()),
        );

        expect(ok.seq).toBe(0);
      });

      it('preserves structured payloads', async () => {
        const ev = {
          type: 'tool_call' as const,
          ts: '2026-10-13T00:00:00.000Z',
          call_id: 'c1',
          name: 'bash',
          input: { cmd: 'ls', nested: [1, { a: null }] },
        };

        await db.transaction((tx) => tx.runEvents.append('r1', ev));
        const [got] = await db.transaction((tx) => tx.runEvents.listByRun('r1'));
        expect(got).toEqual({ ...ev, seq: 0 });
      });
    });

    describe('run tokens', () => {
      const HASH = 'a'.repeat(64);
      const T1 = '2026-10-13T00:00:00.000Z';

      it('stores and returns the hash; null when absent', async () => {
        await db.transaction((tx) => tx.runTokens.put('r1', HASH, T1));
        const got = await db.transaction(async (tx) => ({
          r1: await tx.runTokens.getHash('r1'),
          r2: await tx.runTokens.getHash('r2'),
        }));

        expect(got).toEqual({ r1: HASH, r2: null });
      });

      it('returns null after revoke, leaves other runs alone, and tolerates unknown runs', async () => {
        await db.transaction(async (tx) => {
          await tx.runTokens.put('r1', HASH, T1);
          await tx.runTokens.put('r2', 'b'.repeat(64), T1);
        });

        await db.transaction(async (tx) => {
          await tx.runTokens.revoke('r1', T1);
          await tx.runTokens.revoke('ghost', T1);
        });

        const got = await db.transaction(async (tx) => ({
          r1: await tx.runTokens.getHash('r1'),
          r2: await tx.runTokens.getHash('r2'),
        }));

        expect(got).toEqual({ r1: null, r2: 'b'.repeat(64) });
      });

      it('reissue replaces the hash and clears the revocation (explicit re-arm)', async () => {
        await db.transaction(async (tx) => {
          await tx.runTokens.issue('r1', HASH, T1);
          await tx.runTokens.revoke('r1', T1);
          await tx.runTokens.reissue('r1', 'c'.repeat(64), T1);
        });

        const got = await db.transaction((tx) => tx.runTokens.getHash('r1'));
        expect(got).toBe('c'.repeat(64));
      });

      it.each(['issue', 'put'] as const)(
        '%s on a revoked run is refused and the token stays dead',
        async (method) => {
          await db.transaction(async (tx) => {
            await tx.runTokens.issue('r1', HASH, T1);
            await tx.runTokens.revoke('r1', T1);
          });

          const failure = await db
            .transaction((tx) => tx.runTokens[method]('r1', 'c'.repeat(64), T1))
            .catch((e: unknown) => e);

          const got = await db.transaction((tx) => tx.runTokens.getHash('r1'));
          expect(failure).toBeInstanceOf(PolicyDeniedError);
          expect(got).toBeNull();
        },
      );

      it('issue on a live token replaces it; reissue works for a never-issued run', async () => {
        await db.transaction(async (tx) => {
          await tx.runTokens.issue('r1', HASH, T1);
          await tx.runTokens.issue('r1', 'c'.repeat(64), T1);
          await tx.runTokens.reissue('r2', 'd'.repeat(64), T1);
        });

        const got = await db.transaction(async (tx) => ({
          r1: await tx.runTokens.getHash('r1'),
          r2: await tx.runTokens.getHash('r2'),
        }));

        expect(got).toEqual({ r1: 'c'.repeat(64), r2: 'd'.repeat(64) });
      });

      it('refuses anything that is not a sha256 hex digest (never store a raw token)', async () => {
        await expect(
          db.transaction((tx) => tx.runTokens.put('r1', 'raw-token-value', T1)),
        ).rejects.toThrow();

        const got = await db.transaction((tx) => tx.runTokens.getHash('r1'));
        expect(got).toBeNull();
      });

      it('rolls back with the transaction', async () => {
        await expect(
          db.transaction(async (tx) => {
            await tx.runTokens.put('r1', HASH, T1);
            throw new Error('boom');
          }),
        ).rejects.toThrow('boom');

        expect(await db.transaction((tx) => tx.runTokens.getHash('r1'))).toBeNull();
      });
    });

    describe('interactions', () => {
      it('lists only pending interactions, oldest first, and drops answered ones', async () => {
        await db.transaction(async (tx) => {
          await tx.interactions.insert(
            makeInteraction('i2', { asked_at: '2026-10-13T02:00:00.000Z' }),
          );

          await tx.interactions.insert(makeInteraction('i1'));
          await tx.interactions.insert(makeInteraction('i3', { status: 'cancelled' }));
        });

        const pending = await db.transaction((tx) => tx.interactions.listPending());
        expect(pending.map((i) => i.id)).toEqual(['i1', 'i2']);

        await db.transaction((tx) =>
          tx.interactions.update('i1', {
            status: 'answered',
            answer: { choice: 'sqlite' },
            answered_at: '2026-10-13T03:00:00.000Z',
          }),
        );

        const after = await db.transaction((tx) => tx.interactions.listPending());
        const i1 = await db.transaction((tx) => tx.interactions.get('i1'));
        expect(after.map((i) => i.id)).toEqual(['i2']);
        expect(i1).toMatchObject({ status: 'answered', answer: { choice: 'sqlite' } });
      });

      it('returns null for an unknown interaction', async () => {
        const got = await db.transaction((tx) => tx.interactions.get('nope'));
        expect(got).toBeNull();
      });
    });
  });
}
