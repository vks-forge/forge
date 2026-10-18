/**
 * Shared behaviour suite for every ProjectMemory writer: the git-backed one and the database-backed one.
 *
 * Why: a project's memory is written by one party, the Director, on the owner's word, and the rules of that
 *   write must not depend on where it is stored: the writer stamps author and status itself, a proposal's
 *   confidence is capped, a state move keeps the owner's words and refuses to happen twice, a supersede
 *   retires the old record without editing it, ids are sequential and never reused, concurrent writes do not
 *   collide, projects stay apart and the engine's active slice shows exactly the approved records. One suite
 *   run against both adapters makes the second one the same contract as the first, not a lookalike.
 *
 * Exports: describeWriterBehaviour(), WriterRig.
 * Depends on: vitest, @forge/core, helpers/writer-behaviour-rules. IO only through the adapter under test.
 */

import { describe, expect, it } from 'vitest';
import {
  InvalidInputError,
  MemoryRecordNotFoundError,
  MemoryRecordStateError,
} from '@forge/core';
import type { MemorySlice, ProjectMemory } from '@forge/core';
import { describeWriterRules } from '#tests/helpers/writer-behaviour-rules.js';

/** A writer under test, a way to read what the engine would see, and cleanup. */
export interface WriterRig {
  readonly memory: ProjectMemory;
  /** The active decisions and rejected approaches of the project, as the engine reads them. */
  readonly slice: (slug: string) => Promise<MemorySlice>;
  readonly close: () => Promise<void>;
}

const source = { type: 'chat', ref: 'the owner said so' } as const;

export function describeWriterBehaviour(
  name: string,
  make: () => Promise<WriterRig>,
): void {
  describe(`ProjectMemory writer behaviour: ${name}`, () => {
    const withRig = (fn: (rig: WriterRig) => Promise<void>) => async () => {
      const rig = await make();
      try {
        await fn(rig);
      } finally {
        await rig.close();
      }
    };

    it(
      'propose stores a pending proposal by the director and returns its id and a change reference',
      withRig(async ({ memory }) => {
        const { id, commit } = await memory.writer.propose('shop', {
          statement: 'Prefer vitest over jest',
          source,
          confidence: 0.6,
          tags: ['tests'],
          body: 'Seen in package.json.',
        });

        expect(id).toBe('x-0001');
        expect(commit).not.toBe('');

        expect(await memory.reader.get('shop', 'x-0001')).toMatchObject({
          id: 'x-0001',
          kind: 'proposal',
          status: 'pending',
          author: 'director',
          origin: 'agent',
          confidence: 0.6,
          tags: ['tests'],
          body: 'Seen in package.json.',
        });
      }),
    );

    it(
      'refuses a proposal more confident than the director may be',
      withRig(async ({ memory }) => {
        await expect(
          memory.writer.propose('shop', { statement: 'x', source, confidence: 0.95 }),
        ).rejects.toThrow();

        expect(await memory.reader.list('shop')).toEqual([]);
      }),
    );

    it(
      'decide stores an active decision by the user, pinned by default and unpinned when asked',
      withRig(async ({ memory }) => {
        const a = await memory.writer.decide('shop', {
          statement: 'Ship on Fridays',
          source,
        });

        const b = await memory.writer.decide('shop', {
          statement: 'Test on Mondays',
          source,
          pinned: false,
        });

        expect(a.id).toBe('d-0001');
        expect(await memory.reader.get('shop', 'd-0001')).toMatchObject({
          kind: 'decision',
          status: 'active',
          author: 'user',
          origin: 'owner',
          pinned: true,
        });

        expect(await memory.reader.get('shop', b.id)).toMatchObject({ pinned: false });
      }),
    );

    it(
      'approve keeps the id and the words, stamps who and when, and the engine slice sees it',
      withRig(async ({ memory, slice }) => {
        const { id } = await memory.writer.propose('shop', {
          statement: 'Use zod',
          source,
        });

        expect((await slice('shop')).decisions).toEqual([]);

        await memory.writer.approve('shop', id, 'vikash');

        expect(await memory.reader.get('shop', id)).toMatchObject({
          id: 'x-0001',
          kind: 'decision',
          status: 'active',
          statement: 'Use zod',
          author: 'director',
          origin: 'agent',
          approved_by: 'vikash',
        });

        expect((await memory.reader.get('shop', id))?.approved_at).toEqual(
          expect.any(String),
        );

        expect((await slice('shop')).decisions).toEqual([
          { id: 'x-0001', statement: 'Use zod' },
        ]);
      }),
    );

    it(
      'reject moves the proposal to rejected with the reason and the engine slice lists it',
      withRig(async ({ memory, slice }) => {
        const { id } = await memory.writer.propose('shop', {
          statement: 'Adopt mongo',
          source,
        });

        await memory.writer.reject('shop', id, 'we are on SQLite', 'vikash');

        expect(await memory.reader.get('shop', id)).toMatchObject({
          kind: 'rejected',
          status: 'rejected',
          rejected_reason: 'we are on SQLite',
          rejected_by: 'vikash',
        });

        expect((await slice('shop')).rejected).toEqual([
          { id: 'x-0001', statement: 'Adopt mongo' },
        ]);
      }),
    );

    it(
      'answering a proposal twice, or a missing one, or with no reason, fails and changes nothing',
      withRig(async ({ memory }) => {
        const { id } = await memory.writer.propose('shop', { statement: 'A', source });
        await memory.writer.approve('shop', id, 'vikash');
        const before = await memory.reader.list('shop');

        await expect(memory.writer.reject('shop', id, 'late', 'vikash')).rejects.toThrow(
          MemoryRecordStateError,
        );

        await expect(memory.writer.approve('shop', 'x-0099', 'vikash')).rejects.toThrow(
          MemoryRecordNotFoundError,
        );

        await expect(memory.writer.reject('shop', id, '  ', 'vikash')).rejects.toThrow(
          InvalidInputError,
        );

        expect(await memory.reader.list('shop')).toEqual(before);
      }),
    );

    describeWriterRules(withRig);
  });
}
