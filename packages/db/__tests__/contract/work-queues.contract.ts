/**
 * Contract cases for the run inbox, gate results and the projects registry.
 *
 * Why: steering messages must reach a run exactly once and in order (the inbox is the
 * durable queue between a human and a live run), gate verdicts are the evidence a ticket
 * reaches Review on and must be readable per ticket although they are written per run,
 * and the projects registry is how the Director knows which repo a ticket belongs to.
 * Each is pinned on every backend so the engine can rely on them without caring which
 * database is behind the port (director-core.md §3, §8).
 *
 * Exports: describeWorkQueuesContract().
 * Depends on: vitest, @forge/core, helpers/fixtures. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import { InvalidInputError } from '@forge/core';
import type { StorageAdapter } from '@forge/core';
import {
  makeGate,
  makeInboxMessage,
  makeProject,
  makeRun,
} from '#tests/helpers/fixtures.js';

const T1 = '2026-10-13T01:00:00.000Z';

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeWorkQueuesContract(getDb: () => StorageAdapter): void {
  const tx: StorageAdapter['transaction'] = (fn) => getDb().transaction(fn);

  describe('run inbox', () => {
    it('numbers messages from 0 per run and returns what it stored', async () => {
      const out = await tx(async (t) => ({
        a0: await t.runInbox.append(makeInboxMessage('r1', { text: 'a' })),
        a1: await t.runInbox.append(
          makeInboxMessage('r1', { text: 'b', mode: 'interrupt' }),
        ),
        b0: await t.runInbox.append(makeInboxMessage('r2')),
      }));

      expect(out.a0).toEqual({ ...makeInboxMessage('r1', { text: 'a' }), seq: 0 });
      expect(out.a1).toMatchObject({ seq: 1, mode: 'interrupt' });
      expect(out.b0.seq).toBe(0);
    });

    it('ignores a seq smuggled in by the caller; storage numbers the message', async () => {
      const stored = await tx((t) =>
        t.runInbox.append({ ...makeInboxMessage('r1'), seq: 99 } as never),
      );

      expect(stored.seq).toBe(0);
    });

    it('lists undelivered messages in order and stops listing a delivered one', async () => {
      await tx(async (t) => {
        await t.runInbox.append(makeInboxMessage('r1', { text: 'a' }));
        await t.runInbox.append(makeInboxMessage('r1', { text: 'b' }));
        await t.runInbox.append(makeInboxMessage('r1', { text: 'c' }));
        await t.runInbox.append(makeInboxMessage('r2', { text: 'other run' }));
      });

      const before = await tx((t) => t.runInbox.listUndelivered('r1'));
      const delivered = await tx((t) => t.runInbox.markDelivered('r1', 1, T1));
      const after = await tx((t) => t.runInbox.listUndelivered('r1'));
      expect(before.map((m) => m.text)).toEqual(['a', 'b', 'c']);
      expect(delivered).toBe(true);
      expect(after.map((m) => m.seq)).toEqual([0, 2]);
      expect(
        (await tx((t) => t.runInbox.listUndelivered('r2'))).map((m) => m.text),
      ).toEqual(['other run']);
    });

    it('markDelivered is once-only and false for an unknown message', async () => {
      await tx((t) => t.runInbox.append(makeInboxMessage('r1')));
      const results = await tx(async (t) => [
        await t.runInbox.markDelivered('r1', 0, T1),
        await t.runInbox.markDelivered('r1', 0, '2026-10-13T02:00:00.000Z'),
        await t.runInbox.markDelivered('r1', 7, T1),
        await t.runInbox.markDelivered('ghost', 0, T1),
      ]);

      expect(results).toEqual([true, false, false, false]);
    });

    it('gives concurrent writers distinct, gap-free seqs', async () => {
      await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          getDb().transaction((t) =>
            t.runInbox.append(makeInboxMessage('r1', { text: `m${i}` })),
          ),
        ),
      );

      const all = await tx((t) => t.runInbox.listUndelivered('r1'));
      expect(all.map((m) => m.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });

    it('rejects an invalid message without consuming a seq', async () => {
      await expect(
        tx((t) => t.runInbox.append(makeInboxMessage('r1', { text: '' }))),
      ).rejects.toThrow();

      expect((await tx((t) => t.runInbox.append(makeInboxMessage('r1')))).seq).toBe(0);
    });
  });

  describe('gate results', () => {
    it('assigns increasing ids and returns the stored row', async () => {
      const [a, b] = await tx(async (t) => [
        await t.gateResults.insert(makeGate('r1')),
        await t.gateResults.insert(
          makeGate('r1', {
            gate: 'G2',
            status: 'skipped',
            report_ref: 'generic profile',
            ended_at: T1,
          }),
        ),
      ]);

      expect(a).toEqual({ ...makeGate('r1'), id: a?.id });
      expect(b).toMatchObject({
        gate: 'G2',
        status: 'skipped',
        report_ref: 'generic profile',
        ended_at: T1,
      });

      expect(b?.id).toBeGreaterThan(a?.id ?? 0);
    });

    it('round-trips the head sha the gates judged and reads it as absent when not given', async () => {
      const sha = 'a'.repeat(40);
      const [withSha, without] = await tx(async (t) => [
        await t.gateResults.insert(makeGate('r1', { head_sha: sha })),
        await t.gateResults.insert(makeGate('r1', { gate: 'G2' })),
      ]);

      expect(withSha?.head_sha).toBe(sha);
      expect(without?.head_sha).toBeUndefined();
    });

    it('listByTicket returns the results of every run of that ticket, oldest first', async () => {
      await tx(async (t) => {
        await t.runs.insert(makeRun('r1', { ticket_id: 'SF-1' }));
        await t.runs.insert(makeRun('r2', { ticket_id: 'SF-1', retry_of: 'r1' }));
        await t.runs.insert(makeRun('r3', { ticket_id: 'SF-2' }));
        await t.gateResults.insert(makeGate('r1', { gate: 'G1', status: 'failed' }));
        await t.gateResults.insert(makeGate('r3', { gate: 'G1' }));
        await t.gateResults.insert(makeGate('r2', { gate: 'G1' }));
        await t.gateResults.insert(makeGate('ghost', { gate: 'G3' }));
      });

      const list = await tx((t) => t.gateResults.listByTicket('SF-1'));
      expect(list.map((g) => [g.run_id, g.status])).toEqual([
        ['r1', 'failed'],
        ['r2', 'passed'],
      ]);

      expect(await tx((t) => t.gateResults.listByTicket('SF-9'))).toEqual([]);
    });

    it('rejects an unknown gate name with InvalidInputError', async () => {
      const failure = await tx((t) =>
        t.gateResults.insert(makeGate('r1', { gate: 'G9' as never })),
      ).catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(InvalidInputError);
    });
  });

  describe('projects', () => {
    it('deletes a project row and reports whether there was one', async () => {
      await tx((t) => t.projects.upsert(makeProject('p9')));

      expect(await tx((t) => t.projects.delete('p9'))).toBe(true);
      expect(await tx((t) => t.projects.delete('p9'))).toBe(false);
      expect(await tx((t) => t.projects.get('p9'))).toBeNull();
    });

    it('returns null for an unknown project and reads back an upserted one', async () => {
      const p = makeProject('p1', { repo_origin: 'git@host:x.git', memory_repo: 'mem' });
      await tx((t) => t.projects.upsert(p));
      expect(await tx((t) => t.projects.get('p1'))).toEqual(p);
      expect(await tx((t) => t.projects.get('nope'))).toBeNull();
    });

    it('upsert replaces by id, including clearing optional fields, and keeps list order', async () => {
      await tx(async (t) => {
        await t.projects.upsert(makeProject('p1', { repo_origin: 'git@host:x.git' }));
        await t.projects.upsert(makeProject('p2'));
        await t.projects.upsert(makeProject('p1', { tier_c_globs: ['db/**'] }));
      });

      const list = await tx((t) => t.projects.list());
      expect(list.map((p) => p.id)).toEqual(['p1', 'p2']);
      expect(list[0]).toEqual(makeProject('p1', { tier_c_globs: ['db/**'] }));
      expect('repo_origin' in (list[0] ?? {})).toBe(false);
    });

    it('round-trips structured harness defaults', async () => {
      const p = makeProject('p1', {
        harness_defaults: { default: 'claude', models: { fast: 'x' } },
      });

      await tx((t) => t.projects.upsert(p));
      expect((await tx((t) => t.projects.get('p1')))?.harness_defaults).toEqual(
        p.harness_defaults,
      );
    });

    it('round-trips the local clone, connection, repository, status and ecosystems', async () => {
      const p = makeProject('p1', {
        local_path: 'D:/repos/sf',
        connection_id: 'acme',
        repo_full_name: 'acme/sf',
        status: 'onboarding',
        ecosystems: ['node', 'python'],
      });

      await tx((t) => t.projects.upsert(p));
      expect(await tx((t) => t.projects.get('p1'))).toEqual(p);
      await tx((t) => t.projects.upsert({ ...p, status: 'archived' }));
      expect((await tx((t) => t.projects.get('p1')))?.status).toBe('archived');
    });

    it('two projects cannot share a slug', async () => {
      await tx((t) => t.projects.upsert(makeProject('p1', { slug: 'same' })));
      const failure = await tx((t) =>
        t.projects.upsert(makeProject('p2', { slug: 'same' })),
      ).catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(InvalidInputError);
      expect((await tx((t) => t.projects.list())).map((p) => p.id)).toEqual(['p1']);
    });

    it('rolls back with the transaction', async () => {
      await expect(
        tx(async (t) => {
          await t.projects.upsert(makeProject('p1'));
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      expect(await tx((t) => t.projects.list())).toEqual([]);
    });
  });
}
