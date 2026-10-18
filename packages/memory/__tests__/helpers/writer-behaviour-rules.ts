/**
 * The second half of the shared writer behaviour: supersede, outcomes, ids, concurrency, projects and listing.
 *
 * Why: the writer behaviour suite is shared by the git-backed and the database-backed project memory and is
 *   split in two files to stay readable. This half holds what happens around a record's life: a supersede
 *   retires the old decision without editing its words, an outcome is kept out of the list and the engine
 *   slice, ids are sequential and never reused, concurrent writes do not collide, projects stay apart, and the
 *   list shows proposals before decisions before rejected approaches.
 *
 * Exports: describeWriterRules().
 * Depends on: vitest, @forge/core, helpers/writer-behaviour (types only). IO only through the adapter under test.
 */

import { it, expect } from 'vitest';
import {
  InvalidInputError,
  MemoryRecordNotFoundError,
  MemoryRecordStateError,
} from '@forge/core';
import type { WriterRig } from '#tests/helpers/writer-behaviour.js';

const source = { type: 'chat', ref: 'the owner said so' } as const;

/** Registers the cases inside the caller's `describe`; `withRig` builds and closes one writer per case. */
export function describeWriterRules(
  withRig: (fn: (rig: WriterRig) => Promise<void>) => () => Promise<void>,
): void {
  it(
    'supersede stores a new decision and retires the old one without editing its words',
    withRig(async ({ memory, slice }) => {
      const { id: oldId } = await memory.writer.decide('shop', {
        statement: 'Use REST: simple',
        source,
        tags: ['api'],
      });

      const before = await memory.reader.get('shop', oldId);
      const { id: newId } = await memory.writer.supersede('shop', oldId, {
        statement: 'Use GraphQL',
        source: { type: 'chat', ref: 'changed our mind' },
      });

      expect(newId).toBe('d-0002');
      const old = await memory.reader.get('shop', oldId);
      expect(old).toMatchObject({
        statement: before?.statement,
        source: before?.source,
        author: 'user',
        origin: 'owner',
        status: 'superseded',
        superseded_by: 'd-0002',
      });

      expect(await memory.reader.get('shop', newId)).toMatchObject({
        status: 'active',
        supersedes: oldId,
      });

      expect((await slice('shop')).decisions).toEqual([
        { id: 'd-0002', statement: 'Use GraphQL' },
      ]);
    }),
  );

  it(
    'cannot supersede a record that is not an active decision, or one that is missing',
    withRig(async ({ memory }) => {
      const { id } = await memory.writer.propose('shop', { statement: 'A', source });

      await expect(
        memory.writer.supersede('shop', id, { statement: 'B', source }),
      ).rejects.toThrow(MemoryRecordStateError);

      await expect(
        memory.writer.supersede('shop', 'd-0099', { statement: 'B', source }),
      ).rejects.toThrow(MemoryRecordNotFoundError);

      expect((await memory.reader.list('shop')).map((e) => e.id)).toEqual([id]);
    }),
  );

  it(
    'appendOutcome stores the text, keeps it out of the list and the slice, and refuses empty text',
    withRig(async ({ memory, slice }) => {
      const { id } = await memory.writer.appendOutcome(
        'shop',
        'Shipped login.\n\nPending: logout.',
      );

      expect(id).toBe('o-0001');
      expect(await memory.reader.list('shop')).toEqual([]);
      expect(await slice('shop')).toEqual({ decisions: [], rejected: [] });
      expect(await memory.reader.get('shop', 'o-0001')).toMatchObject({
        kind: 'outcome',
        statement: 'Shipped login.',
        body: 'Shipped login.\n\nPending: logout.',
      });

      await expect(memory.writer.appendOutcome('shop', '  ')).rejects.toThrow(
        InvalidInputError,
      );
    }),
  );

  it(
    'never reuses an id after a proposal is answered',
    withRig(async ({ memory }) => {
      const a = await memory.writer.propose('shop', { statement: 'A', source });
      await memory.writer.approve('shop', a.id, 'u');
      const b = await memory.writer.propose('shop', { statement: 'B', source });

      expect([a.id, b.id]).toEqual(['x-0001', 'x-0002']);
    }),
  );

  it(
    'serialises concurrent writes: unique ids and unique change references',
    withRig(async ({ memory }) => {
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          memory.writer.propose('shop', { statement: `Idea number ${i}`, source }),
        ),
      );

      expect(new Set(results.map((r) => r.id)).size).toBe(8);
      expect(new Set(results.map((r) => r.commit)).size).toBe(8);
      expect(await memory.reader.list('shop')).toHaveLength(8);
    }),
  );

  it(
    'keeps projects apart and treats a bad slug as a typed error on write and as empty on read',
    withRig(async ({ memory }) => {
      await memory.writer.decide('alpha', { statement: 'Alpha rule', source });
      await memory.writer.decide('beta', { statement: 'Beta rule', source });

      expect((await memory.reader.list('alpha')).map((e) => e.statement)).toEqual([
        'Alpha rule',
      ]);

      expect((await memory.reader.list('beta')).map((e) => e.statement)).toEqual([
        'Beta rule',
      ]);

      await expect(
        memory.writer.decide('../x', { statement: 'S', source }),
      ).rejects.toThrow(InvalidInputError);

      expect(await memory.reader.list('../x')).toEqual([]);
      expect(await memory.reader.get('../x', 'd-0001')).toBeNull();
    }),
  );

  it(
    'lists proposals, then decisions, then rejected, and fetches one record with its body',
    withRig(async ({ memory }) => {
      await memory.writer.decide('shop', {
        statement: 'D one',
        source,
        body: 'Details.',
      });

      const p = await memory.writer.propose('shop', { statement: 'P one', source });
      const q = await memory.writer.propose('shop', { statement: 'P two', source });
      await memory.writer.reject('shop', q.id, 'no', 'u');

      expect(
        (await memory.reader.list('shop')).map((e) => [e.id, e.kind, e.status]),
      ).toEqual([
        [p.id, 'proposal', 'pending'],
        ['d-0001', 'decision', 'active'],
        [q.id, 'rejected', 'rejected'],
      ]);

      expect(await memory.reader.get('shop', 'd-0001')).toMatchObject({
        id: 'd-0001',
        statement: 'D one',
        body: 'Details.',
      });

      expect(await memory.reader.get('shop', 'd-0042')).toBeNull();
      expect(await memory.reader.get('shop', '../x')).toBeNull();
    }),
  );
}
