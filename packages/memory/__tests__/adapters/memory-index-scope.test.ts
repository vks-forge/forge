/**
 * Pins that a Worker's reading of memory can only be narrower than its agent allows, and that every read is logged.
 *
 * Why: Workers read project memory through tools, and project memory holds what a Worker must never see:
 *   proposals the owner has not approved, superseded decisions, session outcomes, another project's records,
 *   and rejected approaches or tags outside its agent's slice. The scope comes from the agent through the
 *   server and every filter a Worker sends is laid over it, so no input can widen it; an id outside the slice
 *   is "not found", exactly like an unknown one. Hostile query text must neither throw (it would block a
 *   Director step) nor leave the scope. Every search, get and related call leaves one row so the owner can see
 *   what memory failed to answer.
 *
 * Pins: records a Worker may not see (proposal, outcome, superseded, other project, rejected when not
 *   asked, tags outside the slice) never come back by search, get or related, hostile queries stay inside the
 *   scope (property over a hostile list), the narrowed note, and one log row per call with actor, terms,
 *   filters, hit ids, total, run and ticket, zero-hit searches included, plus pruning by count and age.
 * Depends on: adapters/sql-memory-index, helpers/corpus, @forge/db, @forge/core, vitest. IO: in-memory SQLite.
 */

import { workerScope } from '@forge/core';
import type { MemoryIndex, MemoryScope, StorageAdapter } from '@forge/core';
import { createSqliteStorage } from '@forge/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pruneAccessLog } from '#/adapters/sql-memory-index/access-log.js';
import { createSqlMemoryIndex } from '#/adapters/sql-memory-index/create-sql-memory-index.js';
import { NOW, put, seedCorpus } from '#tests/helpers/corpus.js';

let storage: StorageAdapter;
let index: MemoryIndex;

beforeEach(async () => {
  storage = createSqliteStorage(':memory:');
  index = createSqlMemoryIndex({ storage, now: () => NOW });
  await seedCorpus(storage);
  await put(storage, 'd-0901', 'scopeword visible decision', { tags: ['db'] });
  await put(storage, 'd-0902', 'scopeword other tags decision', { tags: ['api'] });
  await put(storage, 'd-0903', 'scopeword untagged decision');
  await put(storage, 'd-0904', 'scopeword superseded decision', {
    status: 'superseded',
    superseded_by: 'd-0901',
  });

  await put(storage, 'x-0901', 'scopeword proposal', { kind: 'proposal', tags: ['db'] });
  await put(storage, 'o-0901', 'scopeword outcome note', {
    kind: 'outcome',
    tags: ['db'],
  });

  await put(storage, 'r-0901', 'scopeword rejected approach', {
    kind: 'rejected',
    tags: ['db'],
  });

  await put(storage, 'd-0901', 'scopeword leaked other project', {
    project: 'other',
    tags: ['db'],
  });
});

afterEach(async () => {
  await storage.close();
});

const ids = (r: { hits: { id: string }[] }): string[] => r.hits.map((h) => h.id).sort();
const worker = (scope: MemoryScope, extra: Record<string, unknown> = {}) => ({
  project: 'forge',
  actor: 'worker' as const,
  scope,
  run_id: 'run-1',
  ticket_id: 'FG-1',
  ...extra,
});

describe('what a Worker can reach', () => {
  it('sees only active decisions of its slice, tagged or not as the slice says', async () => {
    const open = workerScope({ tags: [], include_rejected: false });
    const db = workerScope({ tags: ['db'], include_rejected: false });

    expect(ids(await index.search({ ...worker(open), terms: ['scopeword'] }))).toEqual([
      'd-0901',
      'd-0902',
      'd-0903',
    ]);

    expect(ids(await index.search({ ...worker(db), terms: ['scopeword'] }))).toEqual([
      'd-0901',
    ]);
  });

  it('sees rejected approaches only when its agent asks for them', async () => {
    const withRejected = workerScope({ tags: [], include_rejected: true });

    expect(
      ids(await index.search({ ...worker(withRejected), terms: ['scopeword'] })),
    ).toEqual(['d-0901', 'd-0902', 'd-0903', 'r-0901']);
  });

  it('cannot widen the slice by asking for a kind, a status or a tag it does not have', async () => {
    const db = workerScope({ tags: ['db'], include_rejected: false });
    const asked = await index.search({
      ...worker(db),
      terms: ['scopeword'],
      kinds: ['rejected', 'proposal', 'outcome'],
      status: ['pending', 'superseded', 'rejected'],
      tags: ['api'],
    });

    expect(asked.hits).toEqual([]);
    expect(asked.narrowed_note).toContain('Narrowed');

    // Each project has its own memory: the same id in another project is a different record.
    const mine = await index.search({ ...worker(db), terms: ['scopeword'] });
    expect(mine.hits[0]?.line).not.toContain('leaked');
  });

  it('gets not found for a proposal, an outcome, a superseded record, an out-of-slice record and an unknown id alike', async () => {
    const db = workerScope({ tags: ['db'], include_rejected: false });
    const got = await index.get(
      'forge',
      ['d-0901', 'x-0901', 'o-0901', 'd-0904', 'd-0902', 'r-0901', 'd-9999'],
      { actor: 'worker', scope: db, run_id: 'run-1', ticket_id: 'FG-1' },
    );

    expect(got.records.map((r) => r.id)).toEqual(['d-0901']);
    expect(got.missing).toEqual([
      'x-0901',
      'o-0901',
      'd-0904',
      'd-0902',
      'r-0901',
      'd-9999',
    ]);
  });

  it('gets no neighbours for an id outside the slice and none that are outside it for one inside', async () => {
    const db = workerScope({ tags: ['db'], include_rejected: false });

    expect(
      await index.related('forge', 'x-0901', 5, { actor: 'worker', scope: db }),
    ).toBeNull();

    const near = await index.related('forge', 'd-0901', 5, {
      actor: 'worker',
      scope: db,
    });

    expect(near?.every((n) => ['d-0901'].includes(n.id) === false)).toBe(true);
    expect(
      near?.some((n) => ['x-0901', 'o-0901', 'd-0904', 'd-0902'].includes(n.id)),
    ).toBe(false);
  });

  it('has the narrowest scope when none is given', async () => {
    const reply = await index.search({
      project: 'forge',
      actor: 'worker',
      terms: ['scopeword'],
    });

    expect(ids(reply)).toEqual(['d-0901', 'd-0902', 'd-0903']);
  });
});

describe('hostile query text', () => {
  const HOSTILE = [
    'a" OR "b',
    'NEAR(',
    '*',
    '-',
    'col:val',
    'statement:scopeword',
    'project:other',
    "'; DROP TABLE memory_records;--",
    'x'.repeat(10_000),
    'the and of',
    '🚀',
    '"',
    'scopeword OR other',
    '{statement}: scopeword',
  ];

  it('never throws and never leaves the scope, as text, as terms or as synonyms', async () => {
    const db = workerScope({ tags: ['db'], include_rejected: false });
    for (const text of HOSTILE) {
      const viaText = await index.search({ ...worker(db), text });
      const viaTerms = await index.search({
        ...worker(db),
        terms: [text.slice(0, 40)],
        synonyms: [text.slice(0, 40)],
      });

      for (const reply of [viaText, viaTerms]) {
        for (const hidden of [
          'x-0901',
          'o-0901',
          'd-0902',
          'd-0903',
          'd-0904',
          'r-0901',
        ]) {
          expect(reply.hits.map((h) => h.id)).not.toContain(hidden);
        }
      }
    }

    expect((await index.get('forge', ['d-0901'], { actor: 'cli' })).records).toHaveLength(
      1,
    );
  });
});

describe('the access log', () => {
  it('writes one row per search, get and related with who, what and how much', async () => {
    const db = workerScope({ tags: ['db'], include_rejected: false });
    await index.search({ ...worker(db), text: 'scopeword', k: 3 });
    await index.get('forge', ['d-0901', 'd-0902'], {
      actor: 'worker',
      scope: db,
      run_id: 'run-1',
      ticket_id: 'FG-1',
    });

    await index.related('forge', 'd-0901', 4, { actor: 'cli' });

    const rows = await storage.transaction((tx) => tx.memory.listAccess('forge', 10));

    expect(rows.map((r) => [r.actor, r.tool])).toEqual([
      ['cli', 'related'],
      ['worker', 'get'],
      ['worker', 'search'],
    ]);

    const search = rows[2];
    expect(search).toMatchObject({
      query: 'scopeword',
      terms: ['scopeword'],
      hit_ids: ['d-0901'],
      total: 1,
      run_id: 'run-1',
      ticket_id: 'FG-1',
    });

    expect(search?.filters).toMatchObject({
      kinds: ['decision'],
      tags: ['db'],
      k: 3,
      offset: 0,
    });

    expect(rows[1]).toMatchObject({
      ids: ['d-0901', 'd-0902'],
      total: 1,
      run_id: 'run-1',
      ticket_id: 'FG-1',
    });

    expect(rows[0]).toMatchObject({ ids: ['d-0901'], filters: { k: 4 } });
  });

  it('keeps a search that found nothing, so misses can be measured', async () => {
    await index.search({ project: 'forge', actor: 'director', text: 'quokka telescope' });

    const [row] = await storage.transaction((tx) => tx.memory.listAccess('forge', 1));

    expect(row).toMatchObject({
      tool: 'search',
      query: 'quokka telescope',
      hit_ids: [],
      total: 0,
    });
  });

  it('is pruned to the newest rows and to the retention window, per project', async () => {
    for (let i = 0; i < 5; i += 1) {
      await index.search({ project: 'forge', actor: 'director', terms: [`term${i}`] });
    }

    await index.search({ project: 'other', actor: 'director', terms: ['x1'] });

    const dropped = await pruneAccessLog(storage, ['forge', 'other'], NOW, {
      keepRows: 2,
      keepDays: 90,
    });

    const forge = await storage.transaction((tx) => tx.memory.listAccess('forge', 10));

    expect(dropped).toBe(3);
    expect(forge.map((r) => r.query)).toEqual(['term4', 'term3']);

    const later = new Date(NOW.getTime() + 91 * 86_400_000);
    expect(
      await pruneAccessLog(storage, ['forge', 'other'], later, {
        keepRows: 100,
        keepDays: 90,
      }),
    ).toBe(3);
  });
});
