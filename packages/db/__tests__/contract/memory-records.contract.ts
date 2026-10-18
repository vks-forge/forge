/**
 * Contract cases for memory records: storing, tags, links, numbering and history.
 *
 * Why: a project memory is what the Director plans against, so both backends must store a record with its tags, links and history entry together, refuse a repeated id or a bad value without leaving anything behind, read links in both directions and number ids per letter without ever reusing one after a record moves.
 *
 * Exports: describeMemoryRecordsContract().
 * Depends on: vitest, @forge/core, helpers/memory-contract-kit, helpers/memory-rows. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import { InvalidInputError } from '@forge/core';
import type { StorageAdapter } from '@forge/core';
import { memoryKit } from '#tests/helpers/memory-contract-kit.js';
import { T_MEM, memoryEvent, memoryRow } from '#tests/helpers/memory-rows.js';

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeMemoryRecordsContract(getDb: () => StorageAdapter): void {
  const { tx, add } = memoryKit(getDb);

  describe('memory: records, tags, links and history', () => {
    it('stores a record with its tags, links and history entry and reads them back', async () => {
      const seq = await add(
        { id: 'd-0001', aliases: ['zod'], gist: 'schemas first' },
        ['b', 'a'],
        [
          { rel: 'cites', target_kind: 'record', target: 'd-0009' },
          { rel: 'card', target_kind: 'card', target: 'FG-C1' },
        ],
      );

      const got = await tx((t) => t.memory.get('forge', 'd-0001'));
      const tags = await tx((t) => t.memory.tagsOf('forge', ['d-0001', 'd-0404']));
      const history = await tx((t) => t.memory.history('forge', 'd-0001'));

      expect(seq).toBeGreaterThan(0);
      expect(got).toEqual(memoryRow({ aliases: ['zod'], gist: 'schemas first' }));
      expect(tags).toEqual({ 'd-0001': ['a', 'b'] });
      expect(history.events).toEqual([{ seq, id: 'd-0001', ...memoryEvent() }]);

      expect(history.versions).toEqual([]);
      expect(await tx((t) => t.memory.get('forge', 'd-9999'))).toBeNull();
      expect(await tx((t) => t.memory.get('other', 'd-0001'))).toBeNull();
    });

    it('refuses a repeated id, a bad tag and a blank statement, and stores nothing from the failed call', async () => {
      await add({ id: 'd-0001' });

      await expect(add({ id: 'd-0001' })).rejects.toBeInstanceOf(InvalidInputError);
      await expect(add({ id: 'd-0002' }, ['Bad Tag'])).rejects.toBeInstanceOf(
        InvalidInputError,
      );

      await expect(add({ id: 'd-0003', statement: '  ' })).rejects.toBeInstanceOf(
        InvalidInputError,
      );

      expect(await tx((t) => t.memory.get('forge', 'd-0002'))).toBeNull();
      expect(await tx((t) => t.memory.get('forge', 'd-0003'))).toBeNull();
    });

    it('reads links in both directions and finds records that share a card or ticket', async () => {
      await add(
        { id: 'd-0001' },
        [],
        [{ rel: 'amends', target_kind: 'record', target: 'd-0002' }],
      );

      await add(
        { id: 'd-0002' },
        [],
        [{ rel: 'card', target_kind: 'card', target: 'FG-C1' }],
      );

      await add(
        { id: 'd-0003' },
        [],
        [{ rel: 'card', target_kind: 'card', target: 'FG-C1' }],
      );

      const one = await tx((t) => t.memory.linksOf('forge', 'd-0001'));
      const two = await tx((t) => t.memory.linksOf('forge', 'd-0002'));

      expect(one.out).toEqual([
        { from_id: 'd-0001', rel: 'amends', target_kind: 'record', target: 'd-0002' },
      ]);

      expect(one.in).toEqual([]);
      expect(two.in).toEqual([
        { from_id: 'd-0001', rel: 'amends', target_kind: 'record', target: 'd-0002' },
      ]);

      expect(two.shared).toEqual([{ id: 'd-0003', rel: 'card', target: 'FG-C1' }]);
    });

    it('numbers ids per letter and project, never reusing one after a record moves', async () => {
      expect(await tx((t) => t.memory.nextId('forge', 'd'))).toBe('d-0001');

      await add({ id: 'd-0001' });
      await add({ id: 'd-0007' });
      await add({
        id: 'x-0001',
        kind: 'proposal',
        status: 'pending',
        author: 'director',
      });

      expect(await tx((t) => t.memory.nextId('forge', 'd'))).toBe('d-0008');
      expect(await tx((t) => t.memory.nextId('forge', 'x'))).toBe('x-0002');
      expect(await tx((t) => t.memory.nextId('forge', 'o'))).toBe('o-0001');
      expect(await tx((t) => t.memory.nextId('other', 'd'))).toBe('d-0001');

      await tx((t) =>
        t.memory.transition(
          'forge',
          'x-0001',
          'approve',
          { approved_at: T_MEM, approved_by: 'me' },
          memoryEvent({ event: 'approved', from_status: 'pending', to_status: 'active' }),
        ),
      );

      expect(await tx((t) => t.memory.nextId('forge', 'x'))).toBe('x-0002');
    });
  });
}
