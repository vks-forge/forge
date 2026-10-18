/**
 * Contract cases for the memory access log, import attempts and project purge.
 *
 * Why: every read of memory leaves one log row (zero-hit searches included) that is pruned by count and age per project; the latest import attempt decides whether a project reads from the database; verification compares stored words and body hashes; and a project purge removes every memory row of that project and no other.
 *
 * Exports: describeMemoryOpsContract().
 * Depends on: vitest, @forge/core, helpers/memory-contract-kit, helpers/memory-rows. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import { directorScope } from '@forge/core';
import type { StorageAdapter } from '@forge/core';
import { memoryKit } from '#tests/helpers/memory-contract-kit.js';
import { T_MEM, memoryEvent, memoryRow } from '#tests/helpers/memory-rows.js';

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeMemoryOpsContract(getDb: () => StorageAdapter): void {
  const { tx, add, ids, m } = memoryKit(getDb);

  describe('memory: access log', () => {
    const entry = (n: number, at: string) => ({
      at,
      actor: 'worker' as const,
      tool: 'search' as const,
      query: `q${n}`,
      terms: ['a'],
      filters: { kinds: ['decision'] },
      hit_ids: ['d-0001'],
      total: 1,
      ids: null,
      run_id: 'run-1',
      ticket_id: 'FG-1',
    });

    it('lists newest first, keeps zero-hit searches and prunes by count and age per project', async () => {
      await tx(async (t) => {
        for (let i = 1; i <= 5; i += 1) {
          await t.memory.appendAccess('forge', entry(i, `2026-10-0${i}T00:00:00.000Z`));
        }

        await t.memory.appendAccess('forge', {
          ...entry(6, '2026-10-06T00:00:00.000Z'),
          hit_ids: [],
          total: 0,
        });

        await t.memory.appendAccess('other', entry(9, '2026-10-01T00:00:00.000Z'));
      });

      const rows = await tx((t) => t.memory.listAccess('forge', 3));
      expect(rows.map((r) => r.query)).toEqual(['q6', 'q5', 'q4']);
      expect(rows[0]).toMatchObject({
        hit_ids: [],
        total: 0,
        run_id: 'run-1',
        ticket_id: 'FG-1',
      });

      const dropped = await tx((t) =>
        t.memory.pruneAccess('forge', 4, '2026-10-02T00:00:00.000Z'),
      );

      expect(dropped).toBe(2);
      expect(
        (await tx((t) => t.memory.listAccess('forge', 50))).map((r) => r.query),
      ).toEqual(['q6', 'q5', 'q4', 'q3']);

      expect(await tx((t) => t.memory.listAccess('other', 50))).toHaveLength(1);
    });
  });

  describe('memory: imports', () => {
    const attempt = (
      n: number,
      state: 'pending' | 'verified' | 'needs_attention' | 'failed',
    ) => ({
      attempt: n,
      at: T_MEM,
      state,
      head_sha: 'abc',
      files: 3,
      imported: 3,
      lenient: 1,
      rejects: [{ path: 'decisions/x.md', reason: 'no id' }],
      backup_path: null,
      verified_at: null,
      repo_deleted_at: null,
      message: null,
    });

    it('returns the latest attempt and replaces an attempt with the same number', async () => {
      expect(await tx((t) => t.memory.importState('forge'))).toBeNull();

      await tx(async (t) => {
        await t.memory.saveImport('forge', attempt(1, 'needs_attention'));
        await t.memory.saveImport('forge', attempt(2, 'pending'));
      });

      await tx((t) =>
        t.memory.saveImport('forge', { ...attempt(2, 'verified'), verified_at: T_MEM }),
      );

      const latest = await tx((t) => t.memory.importState('forge'));
      expect(latest).toMatchObject({ attempt: 2, state: 'verified', verified_at: T_MEM });
      expect(latest?.rejects).toEqual([{ path: 'decisions/x.md', reason: 'no id' }]);
      expect(await tx((t) => t.memory.importState('other'))).toBeNull();
    });

    it('lists what verification compares, flagging records that moved since import', async () => {
      await add({ id: 'd-0001', body: 'hello', imported_from: 'decisions/a.md@abc' }, [
        't',
      ]);

      await add({
        id: 'x-0001',
        kind: 'proposal',
        status: 'pending',
        imported_from: 'proposed/b.md@abc',
      });

      await tx((t) =>
        t.memory.transition(
          'forge',
          'x-0001',
          'approve',
          { approved_at: T_MEM, approved_by: 'me' },
          memoryEvent({ event: 'approved' }),
        ),
      );

      const checks = await tx((t) => t.memory.checksForImport('forge'));
      const one = checks.find((c) => c.id === 'd-0001');

      expect(checks.map((c) => c.id)).toEqual(['d-0001', 'x-0001']);
      expect(one).toMatchObject({
        kind: 'decision',
        status: 'active',
        statement: memoryRow().statement,
        tags: ['t'],
        imported_from: 'decisions/a.md@abc',
        moved: false,
      });

      expect(one?.body_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(checks.find((c) => c.id === 'x-0001')?.moved).toBe(true);
    });
  });

  describe('memory: purge', () => {
    it('removes every memory row of the project and leaves the other project alone', async () => {
      for (const project of ['forge', 'other']) {
        await tx(async (t) => {
          await t.projects.upsert({
            id: project,
            slug: project,
            prefix: 'SF',
            status: 'ready',
            ecosystems: [],
            harness_defaults: { default: 'claude' },
            tier_c_globs: [],
          });

          await t.memory.insertRecord(
            memoryRow({ project, id: 'd-0001', statement: 'omega purge me' }),
            ['t'],
            [{ rel: 'cites', target_kind: 'record', target: 'd-0002' }],
            memoryEvent(),
          );

          await t.memory.setAids(
            project,
            'd-0001',
            { gist: 'g', aliases: [], pinned: true },
            'a',
            T_MEM,
          );

          await t.memory.appendAccess(project, {
            at: T_MEM,
            actor: 'cli',
            tool: 'get',
            query: null,
            terms: null,
            filters: {},
            hit_ids: null,
            total: null,
            ids: ['d-0001'],
            run_id: null,
            ticket_id: null,
          });

          await t.memory.saveImport(project, {
            attempt: 1,
            at: T_MEM,
            state: 'verified',
            head_sha: null,
            files: 0,
            imported: 0,
            lenient: 0,
            rejects: [],
            backup_path: null,
            verified_at: T_MEM,
            repo_deleted_at: null,
            message: null,
          });
        });
      }

      expect(await tx((t) => t.projects.purge('forge'))).toBe(true);

      await tx(async (t) => {
        expect(await t.memory.get('forge', 'd-0001')).toBeNull();
        expect(await t.memory.counts('forge')).toEqual([]);
        expect(await t.memory.tagStats('forge')).toEqual({});
        expect((await t.memory.history('forge', 'd-0001')).events).toEqual([]);
        expect((await t.memory.history('forge', 'd-0001')).versions).toEqual([]);
        expect(await t.memory.listAccess('forge', 10)).toEqual([]);
        expect(await t.memory.importState('forge')).toBeNull();
        expect(
          await t.memory.searchLexical({
            project: 'forge',
            match: m('omega'),
            scope: directorScope(),
            limit: 5,
            snippet: false,
          }),
        ).toEqual([]);

        expect(await t.memory.get('other', 'd-0001')).not.toBeNull();
        expect(await t.memory.tagStats('other')).toEqual({ t: 1 });
        expect(
          ids(
            await t.memory.searchLexical({
              project: 'other',
              match: m('omega'),
              scope: directorScope(),
              limit: 5,
              snippet: false,
            }),
          ),
        ).toEqual(['d-0001']);
      });

      // After a purge the id counter starts fresh for that project: the rows are gone, not hidden.
      expect(await tx((t) => t.memory.nextId('forge', 'd'))).toBe('d-0001');
    });
  });
}
