/**
 * Pins the database-backed project memory: the shared writer behaviour, and what only a database adds.
 *
 * Why: the database replaces the git repository as the home of a project's memory, so it must keep every
 *   promise the git-backed writer made (the shared behaviour suite runs against both) and add what files
 *   could not: one history entry per change with its actor, search aids that leave a version and never
 *   touch the words, typed links, atomic writes (a failed supersede leaves the old record active and no new
 *   one), and the storage triggers as a second lock if code ever tried to rewrite a record. The same suite
 *   runs on the in-memory storage and on SQLite.
 *
 * Pins: the shared behaviour on both storages; history entries and the actor per change; a supersede that
 *   fails stores nothing; links and aids given at write time; the change reference is the history number;
 *   SQLite triggers refuse a direct edit of a stored statement.
 * Depends on: adapters/sql-project-memory, helpers/writer-behaviour, @forge/db, @forge/core, vitest.
 *   IO: in-memory SQLite.
 */

import { describe, expect, it } from 'vitest';
import type { MemorySlice, StorageAdapter } from '@forge/core';
import { createMemoryStorage, createSqliteStorage } from '@forge/db';
import { createSqlProjectMemory } from '#/adapters/sql-project-memory/create-sql-project-memory.js';
import { describeWriterBehaviour } from '#tests/helpers/writer-behaviour.js';

const source = { type: 'chat', ref: 'the owner said so' } as const;

const rig = (storage: StorageAdapter) => {
  let ms = Date.parse('2026-10-15T10:00:00.000Z');
  const memory = createSqlProjectMemory({ storage, now: () => new Date((ms += 1000)) });

  return {
    memory,
    storage,
    slice: async (slug: string): Promise<MemorySlice> =>
      storage.transaction(async (tx) => {
        const decisions = await tx.memory.list(slug, {
          kinds: ['decision'],
          statuses: ['active'],
        });

        const rejected = await tx.memory.list(slug, { kinds: ['rejected'] });
        const shape = (r: { id: string; statement: string }) => ({
          id: r.id,
          statement: r.statement,
        });

        return { decisions: decisions.map(shape), rejected: rejected.map(shape) };
      }),
    close: () => storage.close(),
  };
};

describeWriterBehaviour('database, in-memory storage', async () =>
  rig(createMemoryStorage()),
);

describeWriterBehaviour('database, sqlite', async () =>
  rig(createSqliteStorage(':memory:')),
);

describe.each([
  ['in-memory storage', () => createMemoryStorage()],
  ['sqlite', () => createSqliteStorage(':memory:')],
])('database memory specifics: %s', (_name, makeStorage) => {
  it('writes one history entry per change with the actor, and the reference is its number', async () => {
    const { memory, storage } = rig(makeStorage());
    const p = await memory.writer.propose('shop', { statement: 'Use zod', source });
    const approved = await memory.writer.approve('shop', p.id, 'vikash');
    const history = await storage.transaction((tx) => tx.memory.history('shop', p.id));

    expect(
      history.events.map((e) => [e.event, e.actor, e.from_status, e.to_status]),
    ).toEqual([
      ['proposed', 'director', null, 'pending'],
      ['approved', 'vikash', 'pending', 'active'],
    ]);

    expect(p.commit).toBe(String(history.events[0]?.seq));
    expect(approved.commit).toBe(String(history.events[1]?.seq));
  });

  it('stores nothing when a supersede fails halfway', async () => {
    const { memory, storage } = rig(makeStorage());
    await memory.writer.decide('shop', { statement: 'Old', source });

    await expect(
      memory.writer.supersede('shop', 'd-0001', { statement: '   ', source }),
    ).rejects.toThrow();

    expect(await memory.reader.get('shop', 'd-0001')).toMatchObject({
      status: 'active',
      superseded_by: null,
    });

    expect(await storage.transaction((tx) => tx.memory.get('shop', 'd-0002'))).toBeNull();
    expect(
      (await storage.transaction((tx) => tx.memory.history('shop', 'd-0001'))).events,
    ).toHaveLength(1);
  });

  it('keeps links, gist and aliases given at write time and indexes them for search', async () => {
    const { memory, storage } = rig(makeStorage());
    await memory.writer.decide('shop', { statement: 'Old rule', source });
    const created = await memory.writer.decide('shop', {
      statement: 'Schemas are the source of truth',
      source,
      gist: 'zod first',
      aliases: ['validation'],
      tags: ['core'],
      links: { amends: ['d-0001'], card: 'FG-C1' },
    });

    const row = await storage.transaction((tx) => tx.memory.get('shop', created.id));
    const links = await storage.transaction((tx) =>
      tx.memory.linksOf('shop', created.id),
    );

    expect(row).toMatchObject({ gist: 'zod first', aliases: ['validation'] });
    expect(links.out).toEqual(
      expect.arrayContaining([
        { from_id: 'd-0002', rel: 'amends', target_kind: 'record', target: 'd-0001' },
        { from_id: 'd-0002', rel: 'card', target_kind: 'card', target: 'FG-C1' },
      ]),
    );
  });

  it('records the supersedes link and the reason on the new decision', async () => {
    const { memory, storage } = rig(makeStorage());
    await memory.writer.decide('shop', { statement: 'A', source });
    const { id } = await memory.writer.supersede('shop', 'd-0001', {
      statement: 'B',
      source,
    });

    const links = await storage.transaction((tx) => tx.memory.linksOf('shop', id));
    const old = await storage.transaction((tx) => tx.memory.linksOf('shop', 'd-0001'));

    expect(links.out).toContainEqual({
      from_id: id,
      rel: 'supersedes',
      target_kind: 'record',
      target: 'd-0001',
    });

    expect(old.in).toHaveLength(1);
  });
});

describe('sqlite triggers behind the writer', () => {
  it('refuse a direct edit of a stored statement even from code that bypasses the door', async () => {
    const storage = createSqliteStorage(':memory:');
    const { memory } = rig(storage);
    await memory.writer.decide('shop', { statement: 'Words stay', source });

    // A private connection stands in for "code that bypasses the door": same schema, same triggers.
    const { openSqliteDriver, runMigrations } = await import('@forge/db');
    const driver = openSqliteDriver(':memory:');
    runMigrations(driver);
    driver.run(
      `INSERT INTO memory_records (project, id, kind, status, statement, source_type, source_ref, author, origin, created_at, valid_from)
       VALUES ('shop', 'd-0001', 'decision', 'active', 'Words stay', 'chat', 'x', 'user', 'owner', 't', 't')`,
    );

    expect(() =>
      driver.run("UPDATE memory_records SET statement = 'edited' WHERE id = 'd-0001'"),
    ).toThrow(/memory_immutable/);

    driver.close();
    await storage.close();
  });
});
