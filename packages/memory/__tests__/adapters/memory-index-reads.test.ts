/**
 * Pins the plain reads of the memory index: a record, the list, the digest, rejected approaches, pinned decisions.
 *
 * Why: the Director builds its prompts from these reads and the owner's screen shows them. A record view must
 *   carry provenance (who wrote it, from where, whether it was imported with fields filled in) and cap the body
 *   so no answer is unbounded; the list must show proposals first and never outcomes; the digest must say how
 *   much exists so a prompt can say how much it left out; and every rejected approach must always be
 *   returned, newest first, because a plan that repeats one the owner ruled out must be caught (d-0141 item 6).
 *
 * Pins: record view fields and body cap with and without `full`, imported marker, possible conflicts on a
 *   pending proposal, list order and fields, digest counts and tags, rejected newest first and limited,
 *   pinned only, decisions newest first, history, and the scope applied to each.
 * Depends on: adapters/sql-memory-index, helpers/corpus, @forge/db, @forge/core, vitest. IO: in-memory SQLite.
 */

import { workerScope } from '@forge/core';
import type { MemoryIndex, StorageAdapter } from '@forge/core';
import { createSqliteStorage } from '@forge/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqlMemoryIndex } from '#/adapters/sql-memory-index/create-sql-memory-index.js';
import { NOW, put } from '#tests/helpers/corpus.js';

let storage: StorageAdapter;
let index: MemoryIndex;

beforeEach(async () => {
  storage = createSqliteStorage(':memory:');
  index = createSqlMemoryIndex({ storage, now: () => NOW });
});

afterEach(async () => {
  await storage.close();
});

describe('a record', () => {
  it('carries its provenance, links and aids, and caps a long body unless asked for it whole', async () => {
    await put(storage, 'd-0001', 'Use zod everywhere', {
      body: 'x'.repeat(5000),
      gist: 'zod first',
      aliases: ['validation'],
      tags: ['core'],
      pinned: true,
      links: [{ rel: 'cites', target_kind: 'record', target: 'd-0099' }],
    });

    const { records } = await index.get('forge', ['d-0001'], { actor: 'cli' });
    const whole = await index.get('forge', ['d-0001'], { actor: 'cli', full: true });
    const view = records[0];

    expect(view).toMatchObject({
      id: 'd-0001',
      kind: 'decision',
      status: 'active',
      author: 'user',
      origin: 'owner',
      source: { type: 'chat', ref: 'the owner' },
      tags: ['core'],
      pinned: true,
      gist: 'zod first',
      aliases: ['validation'],
      imported: null,
      body_truncated: true,
      supersedes: null,
      superseded_by: null,
    });

    expect(view?.body).toHaveLength(4000);
    expect(view?.links).toEqual([
      { rel: 'cites', target_kind: 'record', target: 'd-0099' },
    ]);

    expect(whole.records[0]).toMatchObject({ body_truncated: false });
    expect(whole.records[0]?.body).toHaveLength(5000);
  });

  it('says it was imported and which fields were filled in', async () => {
    await storage.transaction((tx) =>
      tx.memory.insertRecord(
        {
          project: 'forge',
          id: 'd-0002',
          kind: 'decision',
          status: 'active',
          statement: 'Imported one',
          body: '',
          source_type: 'imported',
          source_ref: 'raw',
          author: 'director',
          origin: 'agent',
          confidence: null,
          created_at: '2026-10-01',
          valid_from: '2026-10-01',
          valid_to: null,
          superseded_by: null,
          pinned: false,
          approved_at: null,
          approved_by: null,
          rejected_at: null,
          rejected_by: null,
          rejected_reason: null,
          gist: null,
          aliases: [],
          imported_from: 'decisions/d-0002.md@abc',
          raw_front_matter: 'raw',
          lenient_fields: ['author', 'origin'],
        },
        [],
        [],
        {
          at: '2026-10-18',
          actor: 'import',
          event: 'imported',
          from_status: null,
          to_status: 'active',
          reason: null,
        },
      ),
    );

    const view = (await index.get('forge', ['d-0002'], { actor: 'web' })).records[0];

    expect(view?.imported).toEqual({
      from: 'decisions/d-0002.md@abc',
      defaulted_fields: ['author', 'origin'],
    });
  });

  it('shows a pending proposal with the decisions it may conflict with', async () => {
    await put(storage, 'd-0003', 'Prefer vitest over jest for all unit testing here');
    await put(storage, 'x-0001', 'Switch unit testing from vitest to jest', {
      kind: 'proposal',
    });

    const view = (await index.get('forge', ['x-0001'], { actor: 'web' })).records[0];

    expect(view?.possible_conflicts?.map((c) => c.id)).toEqual(['d-0003']);
    expect(view?.possible_conflicts?.[0]?.line).toContain('vitest');
  });

  it('returns the history of a record and null for an unknown one', async () => {
    await put(storage, 'd-0004', 'History subject');

    expect((await index.history('forge', 'd-0004'))?.events.map((e) => e.event)).toEqual([
      'decided',
    ]);

    expect(await index.history('forge', 'd-9999')).toBeNull();
  });
});

describe('the list', () => {
  it('shows proposals, then decisions, then rejected approaches, and never outcomes', async () => {
    await put(storage, 'd-0010', 'A decision', { tags: ['t'], pinned: true });
    await put(storage, 'x-0010', 'A proposal', { kind: 'proposal' });
    await put(storage, 'r-0010', 'A rejection', { kind: 'rejected' });
    await put(storage, 'o-0010', 'An outcome', { kind: 'outcome' });

    const list = await index.list('forge');

    expect(list.map((e) => [e.id, e.kind, e.status])).toEqual([
      ['x-0010', 'proposal', 'pending'],
      ['d-0010', 'decision', 'active'],
      ['r-0010', 'rejected', 'rejected'],
    ]);

    expect(list[1]).toMatchObject({ tags: ['t'], pinned: true, imported: false });
  });

  it('narrows to a scope', async () => {
    await put(storage, 'd-0011', 'Tagged', { tags: ['db'] });
    await put(storage, 'd-0012', 'Other', { tags: ['api'] });
    await put(storage, 'x-0011', 'Proposal', { kind: 'proposal', tags: ['db'] });

    const list = await index.list(
      'forge',
      workerScope({ tags: ['db'], include_rejected: false }),
    );

    expect(list.map((e) => e.id)).toEqual(['d-0011']);
  });
});

describe('what the Director reads', () => {
  beforeEach(async () => {
    await put(storage, 'd-0020', 'Old pinned', {
      pinned: true,
      created_at: '2026-10-01T00:00:00.000Z',
      tags: ['a'],
    });

    await put(storage, 'd-0021', 'Newer pinned', {
      pinned: true,
      created_at: '2026-10-05T00:00:00.000Z',
      tags: ['a', 'b'],
    });

    await put(storage, 'd-0022', 'Newest plain', {
      created_at: '2026-10-09T00:00:00.000Z',
    });

    await put(storage, 'd-0023', 'Superseded', {
      status: 'superseded',
      created_at: '2026-10-09T00:00:00.000Z',
    });

    await put(storage, 'r-0020', 'First rejection', {
      kind: 'rejected',
      created_at: '2026-10-02T00:00:00.000Z',
    });

    await put(storage, 'r-0021', 'Second rejection', {
      kind: 'rejected',
      created_at: '2026-10-08T00:00:00.000Z',
      tags: ['b'],
    });

    await put(storage, 'x-0020', 'Pending', { kind: 'proposal' });
  });

  it('counts what exists, and the tags of what is in force', async () => {
    const d = await index.digest('forge');

    expect(d).toMatchObject({ decisions: 3, rejected: 2, pinned: 2 });
    expect(d.tags).toEqual([
      { tag: 'a', count: 2 },
      { tag: 'b', count: 2 },
    ]);
  });

  it('counts proposals only for a scope that may see them', async () => {
    expect((await index.digest('forge')).proposals).toBe(0);
    expect(
      (
        await index.digest('forge', {
          kinds: ['decision', 'rejected', 'proposal'],
          status: ['active', 'rejected', 'pending'],
          tags: [],
          include_rejected: true,
        })
      ).proposals,
    ).toBe(1);
  });

  it('returns every rejected approach newest first, or the newest few', async () => {
    expect((await index.rejected('forge')).map((r) => r.id)).toEqual([
      'r-0021',
      'r-0020',
    ]);

    expect((await index.rejected('forge', 1)).map((r) => r.id)).toEqual(['r-0021']);
    expect((await index.rejected('forge'))[0]).toEqual({
      id: 'r-0021',
      statement: 'Second rejection',
      tags: ['b'],
    });
  });

  it('returns pinned active decisions newest first, limited', async () => {
    expect((await index.pinned('forge', 10)).map((r) => r.id)).toEqual([
      'd-0021',
      'd-0020',
    ]);

    expect((await index.pinned('forge', 1)).map((r) => r.id)).toEqual(['d-0021']);
  });

  it('returns every active decision newest first, never a superseded one, with its tags only when it has some', async () => {
    const all = await index.decisions('forge');

    expect(all.map((r) => r.id)).toEqual(['d-0022', 'd-0021', 'd-0020']);
    expect(all[0]).toEqual({ id: 'd-0022', statement: 'Newest plain' });
    expect(all[1]?.tags).toEqual(['a', 'b']);
  });

  it('hides rejected approaches from an agent that does not see them and narrows by tag', async () => {
    const noRejected = workerScope({ tags: [], include_rejected: false });
    const tagged = workerScope({ tags: ['b'], include_rejected: true });

    expect(await index.rejected('forge', undefined, noRejected)).toEqual([]);
    expect((await index.rejected('forge', undefined, tagged)).map((r) => r.id)).toEqual([
      'r-0021',
    ]);

    expect((await index.decisions('forge', tagged)).map((r) => r.id)).toEqual(['d-0021']);
    expect((await index.pinned('forge', 5, tagged)).map((r) => r.id)).toEqual(['d-0021']);
  });
});
