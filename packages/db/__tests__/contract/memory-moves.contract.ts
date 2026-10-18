/**
 * Contract cases for the three legal moves of a memory record and for its search aids.
 *
 * Why: a record keeps its words and moves only by approve, reject or supersede, each stamping its own fields and writing one history entry; an illegal move is a typed state error and leaves no history; search aids leave a version row and a history entry and become searchable. Both backends must behave alike.
 *
 * Exports: describeMemoryMovesContract().
 * Depends on: vitest, @forge/core, helpers/memory-contract-kit, helpers/memory-rows. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import { MemoryRecordNotFoundError, MemoryRecordStateError } from '@forge/core';
import type { StorageAdapter } from '@forge/core';
import { memoryKit } from '#tests/helpers/memory-contract-kit.js';
import { T_MEM, memoryEvent, memoryRow } from '#tests/helpers/memory-rows.js';

/** Registers the cases; `getDb` returns the adapter the surrounding suite created for this test. */
export function describeMemoryMovesContract(getDb: () => StorageAdapter): void {
  const { tx, add, search, ids, m } = memoryKit(getDb);

  describe('memory: moves', () => {
    const proposal = (id = 'x-0001') =>
      add({
        id,
        kind: 'proposal',
        status: 'pending',
        author: 'director',
        origin: 'agent',
      });

    it('approves, rejects and supersedes, stamping the fields and writing one history entry each', async () => {
      await proposal('x-0001');
      await proposal('x-0002');
      await add({ id: 'd-0001' });

      await tx((t) =>
        t.memory.transition(
          'forge',
          'x-0001',
          'approve',
          { approved_at: T_MEM, approved_by: 'vikash' },
          memoryEvent({ event: 'approved', from_status: 'pending', to_status: 'active' }),
        ),
      );

      await tx((t) =>
        t.memory.transition(
          'forge',
          'x-0002',
          'reject',
          { rejected_at: T_MEM, rejected_by: 'vikash', rejected_reason: 'too heavy' },
          memoryEvent({
            event: 'rejected',
            from_status: 'pending',
            to_status: 'rejected',
            reason: 'too heavy',
          }),
        ),
      );

      await tx((t) =>
        t.memory.transition(
          'forge',
          'd-0001',
          'supersede',
          { superseded_by: 'x-0001', valid_to: T_MEM },
          memoryEvent({
            event: 'superseded',
            from_status: 'active',
            to_status: 'superseded',
          }),
        ),
      );

      const approved = await tx((t) => t.memory.get('forge', 'x-0001'));
      const rejected = await tx((t) => t.memory.get('forge', 'x-0002'));
      const old = await tx((t) => t.memory.get('forge', 'd-0001'));

      expect(approved).toMatchObject({
        kind: 'decision',
        status: 'active',
        approved_at: T_MEM,
        approved_by: 'vikash',
        author: 'director',
        statement: memoryRow().statement,
      });

      expect(rejected).toMatchObject({
        kind: 'rejected',
        status: 'rejected',
        rejected_by: 'vikash',
        rejected_reason: 'too heavy',
      });

      expect(old).toMatchObject({
        status: 'superseded',
        superseded_by: 'x-0001',
        valid_to: T_MEM,
      });

      const events = (await tx((t) => t.memory.history('forge', 'x-0002'))).events;
      expect(events.map((e) => e.event)).toEqual(['decided', 'rejected']);
    });

    it('refuses an illegal move with a state error and an unknown record with a not-found error', async () => {
      await proposal('x-0001');
      await add({ id: 'd-0001' });
      const approve = (id: string) =>
        tx((t) =>
          t.memory.transition(
            'forge',
            id,
            'approve',
            { approved_at: T_MEM, approved_by: 'me' },
            memoryEvent({ event: 'approved' }),
          ),
        );

      await approve('x-0001');
      await expect(approve('x-0001')).rejects.toBeInstanceOf(MemoryRecordStateError);
      await expect(approve('d-0001')).rejects.toBeInstanceOf(MemoryRecordStateError);
      await expect(approve('x-0404')).rejects.toBeInstanceOf(MemoryRecordNotFoundError);

      await expect(
        tx((t) =>
          t.memory.transition(
            'forge',
            'x-0001',
            'supersede',
            { superseded_by: 'd-0002', valid_to: T_MEM },
            memoryEvent({ event: 'superseded' }),
          ),
        ),
      ).resolves.toBeGreaterThan(0);

      await expect(
        tx((t) =>
          t.memory.transition(
            'forge',
            'x-0001',
            'supersede',
            { superseded_by: 'd-0003', valid_to: T_MEM },
            memoryEvent({ event: 'superseded' }),
          ),
        ),
      ).rejects.toBeInstanceOf(MemoryRecordStateError);

      // Nothing from the refused calls reached the history.
      const events = (await tx((t) => t.memory.history('forge', 'x-0001'))).events;
      expect(events.map((e) => e.event)).toEqual(['decided', 'approved', 'superseded']);
    });

    it('sets search aids with a version row and a history entry, and the alias becomes searchable', async () => {
      await add({ id: 'd-0001', statement: 'Rows never change after insert' });
      expect(ids(await search(m('immutable')))).toEqual([]);

      await tx((t) =>
        t.memory.setAids(
          'forge',
          'd-0001',
          { gist: 'append only', aliases: ['immutable', 'frozen'], pinned: true },
          'director',
          T_MEM,
        ),
      );

      await tx((t) =>
        t.memory.setAids(
          'forge',
          'd-0001',
          { gist: 'append only', aliases: ['immutable'], pinned: true },
          'director',
          T_MEM,
        ),
      );

      const row = await tx((t) => t.memory.get('forge', 'd-0001'));
      const history = await tx((t) => t.memory.history('forge', 'd-0001'));

      expect(row).toMatchObject({
        gist: 'append only',
        aliases: ['immutable'],
        pinned: true,
      });

      expect(history.versions.map((v) => v.version)).toEqual([1, 2]);
      expect(history.versions[0]).toMatchObject({
        aliases: 'immutable\nfrozen',
        pinned: true,
      });

      expect(history.events.map((e) => e.event)).toEqual([
        'decided',
        'aids_set',
        'aids_set',
      ]);

      expect(ids(await search(m('immutable')))).toEqual(['d-0001']);
      expect(ids(await search(m('frozen')))).toEqual([]);
    });
  });
}
