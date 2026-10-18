/**
 * Contract cases for listing, counting and searching memory records.
 *
 * Why: what a Worker may see is decided inside the query: one project search never returns another rows, status, kind, tag and rejected-approach limits apply in SQL and not after ranking, a statement hit outranks a body hit, snippets mark matches, and the index follows a rolled-back transaction. Both backends are held to the same answers; ranking quality is pinned on SQLite only.
 *
 * Exports: describeMemoryReadContract().
 * Depends on: vitest, @forge/core, helpers/memory-contract-kit, helpers/memory-rows. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import { buildMatch, directorScope, workerScope } from '@forge/core';
import type { MemoryScope, StorageAdapter } from '@forge/core';
import { memoryKit } from '#tests/helpers/memory-contract-kit.js';
import { memoryEvent, memoryRow } from '#tests/helpers/memory-rows.js';

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeMemoryReadContract(getDb: () => StorageAdapter): void {
  const { tx, add, search, ids, m } = memoryKit(getDb);

  describe('memory: list and counts', () => {
    const seed = async (): Promise<void> => {
      await add({ id: 'd-0001', created_at: '2026-10-01T00:00:00.000Z' }, ['db']);
      await add({ id: 'd-0002', pinned: true, created_at: '2026-10-02T00:00:00.000Z' }, [
        'api',
        'db',
      ]);

      await add({
        id: 'd-0003',
        status: 'superseded',
        created_at: '2026-10-03T00:00:00.000Z',
      });

      await add(
        { id: 'x-0001', kind: 'proposal', status: 'pending', author: 'director' },
        ['db'],
      );

      await add({ id: 'r-0001', kind: 'rejected', status: 'rejected' }, ['api']);
      await add({ id: 'd-0001', project: 'other' });
    };

    const list = (filter = {}) =>
      tx((t) => t.memory.list('forge', filter)).then((r) => ids(r));

    it('filters in the query by kind, status, any-of tags, pinned and ids, and never mixes projects', async () => {
      await seed();

      expect(await list()).toEqual(['d-0001', 'd-0002', 'd-0003', 'r-0001', 'x-0001']);
      expect(await list({ kinds: ['rejected'] })).toEqual(['r-0001']);
      expect(await list({ statuses: ['active'] })).toEqual(['d-0001', 'd-0002']);
      expect(await list({ tags: ['api'] })).toEqual(['d-0002', 'r-0001']);
      expect(await list({ tags: ['api', 'db'] })).toEqual([
        'd-0001',
        'd-0002',
        'r-0001',
        'x-0001',
      ]);

      expect(await list({ pinned: true })).toEqual(['d-0002']);
      expect(await list({ ids: ['d-0003', 'r-0001', 'nope'] })).toEqual([
        'd-0003',
        'r-0001',
      ]);

      expect(await list({ tags: [] })).toHaveLength(5);
    });

    it('orders newest first and pages', async () => {
      await seed();

      expect(await list({ order: 'newest', kinds: ['decision'] })).toEqual([
        'd-0003',
        'd-0002',
        'd-0001',
      ]);

      expect(await list({ limit: 2 })).toEqual(['d-0001', 'd-0002']);
      expect(await list({ limit: 2, offset: 3 })).toEqual(['r-0001', 'x-0001']);
    });

    it('counts per kind and status for one project', async () => {
      await seed();
      const counts = await tx((t) => t.memory.counts('forge'));

      expect(counts).toEqual(
        expect.arrayContaining([
          { kind: 'decision', status: 'active', count: 2 },
          { kind: 'decision', status: 'superseded', count: 1 },
          { kind: 'proposal', status: 'pending', count: 1 },
          { kind: 'rejected', status: 'rejected', count: 1 },
        ]),
      );

      expect(counts).toHaveLength(4);
    });

    it('counts the records holding each tag, over all records or only some statuses', async () => {
      await seed();

      expect(await tx((t) => t.memory.tagStats('forge'))).toEqual({ db: 3, api: 2 });
      expect(await tx((t) => t.memory.tagStats('forge', ['active']))).toEqual({
        db: 2,
        api: 1,
      });
    });
  });

  describe('memory: lexical search', () => {
    it('never returns another project, and filters status in the query', async () => {
      await add({ id: 'd-0001', statement: 'alpha shared word' });
      await add({ id: 'd-0002', statement: 'alpha old word', status: 'superseded' });
      await add({ id: 'd-0001', project: 'other', statement: 'alpha leaked word' });

      expect(ids(await search(m('alpha')))).toEqual(['d-0001']);
      expect(ids(await search(m('alpha'), directorScope(), 'other'))).toEqual(['d-0001']);

      const withOld = {
        ...directorScope(),
        status: ['active', 'superseded'],
      } as MemoryScope;

      expect(ids(await search(m('alpha'), withOld)).sort()).toEqual(['d-0001', 'd-0002']);
      expect(await search(m('leaked'))).toEqual([]);
    });

    it('applies kinds, rejected approaches and tags of the scope inside the query', async () => {
      await add({ id: 'd-0001', statement: 'beta dec' }, ['db']);
      await add({ id: 'd-0002', statement: 'beta dec two' }, ['api']);
      await add({ id: 'd-0003', statement: 'beta dec untagged' });
      await add(
        { id: 'r-0001', kind: 'rejected', status: 'rejected', statement: 'beta rej' },
        ['db'],
      );

      await add({
        id: 'x-0001',
        kind: 'proposal',
        status: 'pending',
        author: 'director',
        statement: 'beta proposal',
      });

      expect(ids(await search(m('beta'))).sort()).toEqual([
        'd-0001',
        'd-0002',
        'd-0003',
        'r-0001',
      ]);

      expect(
        ids(
          await search(m('beta'), workerScope({ tags: [], include_rejected: false })),
        ).sort(),
      ).toEqual(['d-0001', 'd-0002', 'd-0003']);

      expect(
        ids(
          await search(m('beta'), workerScope({ tags: ['db'], include_rejected: true })),
        ).sort(),
      ).toEqual(['d-0001', 'r-0001']);

      expect(
        ids(
          await search(m('beta'), workerScope({ tags: ['db'], include_rejected: false })),
        ),
      ).toEqual(['d-0001']);

      expect(await search(m('beta'), { ...directorScope(), kinds: [] })).toEqual([]);
    });

    it('ranks a statement hit above a body hit, limits the list and returns snippets when asked', async () => {
      await add({ id: 'd-0001', statement: 'plain words only', body: 'zeta zeta zeta' });
      await add({ id: 'd-0002', statement: 'zeta leads the statement' });

      const hits = await search(m('zeta'));
      expect(ids(hits)).toEqual(['d-0002', 'd-0001']);
      expect(hits[0]?.score).toBeGreaterThan(hits[1]?.score ?? Infinity);
      expect(hits.every((h) => h.snippet === null)).toBe(true);
      expect(ids(await search(m('zeta'), directorScope(), 'forge', 1))).toEqual([
        'd-0002',
      ]);

      const withSnippet = await tx((t) =>
        t.memory.searchLexical({
          project: 'forge',
          match: m('zeta'),
          scope: directorScope(),
          limit: 5,
          snippet: true,
        }),
      );

      expect(withSnippet[0]?.snippet).toContain('\u0001zeta\u0002');
    });

    it('supports AND, OR and a prefix, and answers an empty match with nothing', async () => {
      await add({ id: 'd-0001', statement: 'gamma delta' });
      await add({ id: 'd-0002', statement: 'gamma epsilon' });

      expect(
        ids(
          await search(buildMatch({ terms: ['gamma', 'delta'], mode: 'and' }) as string),
        ),
      ).toEqual(['d-0001']);

      expect(
        ids(
          await search(buildMatch({ terms: ['delta', 'epsilon'], mode: 'or' }) as string),
        ).sort(),
      ).toEqual(['d-0001', 'd-0002']);

      expect(
        ids(
          await search(
            buildMatch({ terms: ['epsi'], mode: 'and', prefix: true }) as string,
          ),
        ),
      ).toEqual(['d-0002']);

      expect(await search('')).toEqual([]);
    });

    it('keeps the index in step with a rolled-back transaction, a reindex and the tags', async () => {
      await expect(
        tx(async (t) => {
          await t.memory.insertRecord(
            memoryRow({ id: 'd-0001', statement: 'eta ghost' }),
            [],
            [],
            memoryEvent(),
          );

          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      expect(await search(m('ghost'))).toEqual([]);

      await add({ id: 'd-0002', statement: 'theta real' }, ['topic']);
      expect(ids(await search(m('topic')))).toEqual(['d-0002']);

      await tx((t) => t.memory.reindex('forge'));
      expect(ids(await search(m('real')))).toEqual(['d-0002']);
      expect(ids(await search(m('topic')))).toEqual(['d-0002']);
    });

    it('counts how many records hold a term', async () => {
      await add({ id: 'd-0001', statement: 'iota kappa' });
      await add({ id: 'd-0002', statement: 'iota lambda' });
      await add({ id: 'd-0001', project: 'other', statement: 'iota mu' });

      const df = await tx((t) =>
        t.memory.documentFrequency('forge', ['iota', 'kappa', 'nothing']),
      );

      expect(df).toEqual({ iota: 2, kappa: 1, nothing: 0 });
    });
  });
}
