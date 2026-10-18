/**
 * Pins that each project's memory is on one backend at a time and switches when its import is verified.
 *
 * Why: memory moves into the database project by project, after a proof. A project that failed its proof must
 *   keep working from its old repository, readable and writable, while a verified one reads and writes the
 *   database, and the switch must happen on the very next call with no restart. The Director and the screen
 *   ask one index for both, so for a project still on files the index answers from the files' active slice
 *   (decisions and rejected approaches, a keyword filter) and says nothing it cannot know.
 *
 * Pins: a project on files writes and reads the git repository only and a project on the database the
 *   database only, the switch on the next call, the index and the old slice port answering from the right
 *   backend, a scope hiding rejected approaches on files, `get` through a scope, and unknown ids.
 * Depends on: adapters/routed-memory, adapters/sql-project-memory, adapters/sql-memory-index,
 *   adapters/git-project-memory, adapters/file-memory-source, @forge/db, vitest. IO: temp folder, `git`.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { workerScope } from '@forge/core';
import { createMemoryStorage } from '@forge/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFileMemorySource } from '#/adapters/file-memory-source.js';
import { createProjectMemory } from '#/adapters/git-project-memory/create-project-memory.js';
import { createRoutedMemory } from '#/adapters/routed-memory/create-routed-memory.js';
import { createSqlMemoryIndex } from '#/adapters/sql-memory-index/create-sql-memory-index.js';
import { createSqlProjectMemory } from '#/adapters/sql-project-memory/create-sql-project-memory.js';
import type { MemoryBackend } from '#/types/routed-memory.types.js';

let root: string;
const NOW = new Date('2026-10-18T12:00:00Z');
const source = { type: 'chat', ref: 'owner' } as const;
const states = new Map<string, MemoryBackend>();

function rig() {
  const storage = createMemoryStorage();
  let ms = Date.parse('2026-10-15T10:00:00Z');
  const now = () => new Date((ms += 1000));
  const routed = createRoutedMemory({
    db: createSqlProjectMemory({ storage, now }),
    dbIndex: createSqlMemoryIndex({ storage, now: () => NOW }),
    files: createProjectMemory({ rootDir: root, now }),
    fileSource: createFileMemorySource(root),
    stateOf: async (p) => states.get(p) ?? 'db',
  });

  return { storage, ...routed };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'forge-routed-'));
  states.clear();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('one backend per project', () => {
  it('writes a files project to its repository and a database project to the database, apart', async () => {
    states.set('old', 'files');
    const { memory, storage } = rig();

    await memory.writer.decide('old', { statement: 'Kept on files', source });
    await memory.writer.decide('new', { statement: 'Kept in the database', source });

    expect((await memory.reader.list('old')).map((e) => e.statement)).toEqual([
      'Kept on files',
    ]);

    expect((await memory.reader.list('new')).map((e) => e.statement)).toEqual([
      'Kept in the database',
    ]);

    expect(await storage.transaction((tx) => tx.memory.get('old', 'd-0001'))).toBeNull();
    expect(
      await storage.transaction((tx) => tx.memory.get('new', 'd-0001')),
    ).not.toBeNull();

    expect((await createFileMemorySource(root).slice('old')).decisions).toHaveLength(1);
    expect((await createFileMemorySource(root).slice('new')).decisions).toHaveLength(0);
  });

  it('switches on the very next call when the state changes', async () => {
    states.set('shop', 'files');
    const { memory, index, source: slice } = rig();
    await memory.writer.decide('shop', { statement: 'Written on files', source });

    expect((await index.decisions('shop')).map((r) => r.statement)).toEqual([
      'Written on files',
    ]);

    states.set('shop', 'db');

    expect(await memory.reader.list('shop')).toEqual([]);
    expect(await index.decisions('shop')).toEqual([]);
    await memory.writer.decide('shop', { statement: 'Written in the database', source });
    expect((await slice.slice('shop')).decisions.map((r) => r.statement)).toEqual([
      'Written in the database',
    ]);
  });
});

describe('the index for a project still on files', () => {
  async function filesProject() {
    states.set('old', 'files');
    const r = rig();
    await r.memory.writer.decide('old', {
      statement: 'Run vitest for unit tests',
      source,
      tags: ['tests'],
    });

    await r.memory.writer.decide('old', {
      statement: 'Ship on Fridays only',
      source,
      tags: ['release'],
    });

    const p = await r.memory.writer.propose('old', {
      statement: 'Adopt mongo for storage',
      source,
    });

    await r.memory.writer.reject('old', p.id, 'we use sqlite', 'vikash');

    return r;
  }

  it('answers a keyword search from the active slice, decisions and rejected approaches', async () => {
    const { index } = await filesProject();

    const reply = await index.search({
      project: 'old',
      actor: 'director',
      text: 'vitest tests',
    });

    const rejected = await index.search({
      project: 'old',
      actor: 'director',
      terms: ['mongo'],
    });

    expect(reply.hits.map((h) => h.id)).toEqual(['d-0001']);
    expect(rejected.hits.map((h) => [h.id, h.kind, h.status])).toEqual([
      ['x-0001', 'rejected', 'rejected'],
    ]);

    expect(
      await index.search({ project: 'old', actor: 'director', text: 'the and' }),
    ).toEqual({
      hits: [],
      total: 0,
      truncated: false,
    });
  });

  it('lists decisions, rejected approaches and counts, and never claims pinned or links', async () => {
    const { index } = await filesProject();

    expect((await index.decisions('old')).map((r) => r.id)).toEqual(['d-0002', 'd-0001']);
    expect((await index.rejected('old')).map((r) => r.id)).toEqual(['x-0001']);
    expect(await index.pinned('old', 5)).toEqual([]);
    expect(await index.digest('old')).toMatchObject({
      decisions: 2,
      rejected: 1,
      pinned: 0,
      proposals: 0,
    });

    expect(await index.related('old', 'd-0001', 5, { actor: 'cli' })).toEqual([]);
    expect(await index.history('old', 'd-0001')).toBeNull();
  });

  it('honours an agent slice: no rejected approaches, tags narrow', async () => {
    const { index } = await filesProject();
    const noRejected = workerScope({ tags: [], include_rejected: false });
    const release = workerScope({ tags: ['release'], include_rejected: true });

    expect(await index.rejected('old', undefined, noRejected)).toEqual([]);
    expect((await index.decisions('old', release)).map((r) => r.id)).toEqual(['d-0002']);
    expect(
      (
        await index.search({
          project: 'old',
          actor: 'worker',
          scope: release,
          text: 'vitest fridays',
        })
      ).hits.map((h) => h.id),
    ).toEqual(['d-0002']);
  });

  it('gets a record through the scope and treats an unknown id as missing', async () => {
    const { index } = await filesProject();
    const got = await index.get('old', ['d-0001', 'd-0099'], {
      actor: 'worker',
      scope: workerScope({ tags: ['tests'], include_rejected: false }),
    });

    expect(got.records.map((r) => r.id)).toEqual(['d-0001']);
    expect(got.missing).toEqual(['d-0099']);
    expect(got.records[0]).toMatchObject({
      author: 'user',
      origin: 'owner',
      pinned: true,
    });
  });
});
