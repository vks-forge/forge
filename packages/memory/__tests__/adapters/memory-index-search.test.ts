/**
 * Pins how project memory is searched: keywords, questions, fallback, boosts, successors and size.
 *
 * Why: the Director and the Workers no longer read every record; they ask and get the few that answer. The
 *   search must find the record an agent looks for from the keywords it would type, must be honest that a
 *   free-text question can miss unless it is rewritten into key words and synonyms (a rewrite that is
 *   handed to the search finds it), must widen from "all words" to "any word" only when too few records
 *   match all, must put an owner-pinned decision first, must answer a search for an old decision with the
 *   decision that replaced it, and must never return more than a Worker can read at a glance (2,500
 *   characters), saying how many matched in all.
 *
 * Pins: with a corpus of seventy records, ten agent-style keyword queries land the target in the top three; a
 *   natural-language question misses and the same need with terms and synonyms hits; AND then OR; pinned
 *   boost; a superseded record replaced by its active successor once, through a chain, and shown as itself
 *   when superseded records are asked for; total, truncated, k, offset and the 2,500-character cap;
 *   stop-word-only queries; tag hints; web snippets as text with index ranges.
 * Depends on: adapters/sql-memory-index, helpers/corpus, @forge/db, vitest. IO: in-memory SQLite.
 */

import type { MemoryIndex, StorageAdapter } from '@forge/core';
import { createSqliteStorage } from '@forge/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqlMemoryIndex } from '#/adapters/sql-memory-index/create-sql-memory-index.js';
import { NOW, TARGETS, put, seedCorpus } from '#tests/helpers/corpus.js';

let storage: StorageAdapter;
let index: MemoryIndex;

beforeEach(async () => {
  storage = createSqliteStorage(':memory:');
  index = createSqlMemoryIndex({ storage, now: () => NOW });
  await seedCorpus(storage);
});

afterEach(async () => {
  await storage.close();
});

const ids = (r: { hits: { id: string }[] }): string[] => r.hits.map((h) => h.id);
const search = (q: Partial<Parameters<MemoryIndex['search']>[0]> & { text?: string }) =>
  index.search({ project: 'forge', actor: 'worker', ...q });

describe('keywords', () => {
  it.each(TARGETS.map((t) => [t.id, t.query] as const))(
    'finds %s in the top three from the words an agent would type: %s',
    async (id, query) => {
      const reply = await search({ text: query, scope: undefined, actor: 'director' });

      expect(ids(reply).slice(0, 3)).toContain(id);
      expect(reply.total).toBeGreaterThan(0);
    },
  );
});

describe('a question that is not key words', () => {
  const QUESTION = 'how do we make sure big changes are verified?';

  it('may miss on its own, and finds the record when handed terms and synonyms', async () => {
    const plain = await search({ text: QUESTION, actor: 'director' });
    const rewritten = await search({
      text: QUESTION,
      terms: ['tdd'],
      synonyms: ['test-first', 'red-green'],
      actor: 'director',
    });

    expect(ids(plain)).not.toContain('d-0101');
    expect(ids(rewritten).slice(0, 3)).toContain('d-0101');
  });
});

describe('all words, then any word', () => {
  it('adds records that match only some words when fewer than three match all of them', async () => {
    await put(storage, 'd-0401', 'grapefruit orchard');
    await put(storage, 'd-0402', 'grapefruit juice');
    await put(storage, 'd-0403', 'banana orchard');

    const reply = await search({ terms: ['grapefruit', 'orchard'], actor: 'director' });

    expect(ids(reply)[0]).toBe('d-0401');
    expect(ids(reply)).toEqual(expect.arrayContaining(['d-0402', 'd-0403']));
  });

  it('stays with all-words matches when three or more records have them', async () => {
    for (const n of [410, 411, 412]) {
      await put(storage, `d-0${n}`, `kiwi lemon variety ${n}`);
    }

    await put(storage, 'd-0413', 'kiwi only here');

    const reply = await search({ terms: ['kiwi', 'lemon'], actor: 'director' });

    expect(ids(reply).sort()).toEqual(['d-0410', 'd-0411', 'd-0412']);
  });
});

describe('boosts', () => {
  it('puts a pinned decision before an equally good unpinned one', async () => {
    await put(storage, 'd-0301', 'pinboost shared marker one');
    await put(storage, 'd-0302', 'pinboost shared marker two', { pinned: true });

    const reply = await search({ terms: ['pinboost'], actor: 'director' });

    expect(ids(reply)).toEqual(['d-0302', 'd-0301']);
  });
});

describe('a superseded decision', () => {
  beforeEach(async () => {
    await put(storage, 'd-0501', 'Use REST for the public interface', {
      status: 'superseded',
      superseded_by: 'd-0502',
    });

    await put(storage, 'd-0502', 'Use GraphQL for the public interface', {
      links: [{ rel: 'supersedes', target_kind: 'record', target: 'd-0501' }],
    });
  });

  it('is replaced by its active successor, named once', async () => {
    const reply = await search({ terms: ['rest'], actor: 'director' });

    expect(reply.hits.map((h) => [h.id, h.replaced_by])).toEqual([['d-0502', 'd-0501']]);
  });

  it('is shown as itself, successor beside it by its link, when superseded records are asked for', async () => {
    const reply = await search({
      terms: ['rest'],
      status: ['active', 'superseded'],
      actor: 'cli',
    });

    expect(reply.hits[0]).toMatchObject({ id: 'd-0501', status: 'superseded' });
    expect(reply.hits.every((h) => h.replaced_by === undefined)).toBe(true);
  });

  it('is followed through a chain to the one active record, once', async () => {
    await put(storage, 'd-0503', 'Prefer chainterm one', {
      status: 'superseded',
      superseded_by: 'd-0504',
    });

    await put(storage, 'd-0504', 'Prefer chainterm two', {
      status: 'superseded',
      superseded_by: 'd-0505',
    });

    await put(storage, 'd-0505', 'Settled answer five');

    const reply = await search({ terms: ['chainterm'], actor: 'director' });

    expect(reply.hits.map((h) => [h.id, h.replaced_by])).toEqual([['d-0505', 'd-0503']]);
  });
});

describe('size', () => {
  it('says how many matched in all and that the list was cut', async () => {
    for (let i = 0; i < 30; i += 1) {
      await put(storage, `d-${String(600 + i).padStart(4, '0')}`, `bulkterm number ${i}`);
    }

    const reply = await search({ terms: ['bulkterm'], k: 5, actor: 'director' });

    expect(reply).toMatchObject({ total: 30, truncated: true });
    expect(reply.hits).toHaveLength(5);

    const page2 = await search({
      terms: ['bulkterm'],
      k: 5,
      offset: 5,
      actor: 'director',
    });

    expect(ids(page2).some((id) => ids(reply).includes(id))).toBe(false);
    expect(page2.hits).toHaveLength(5);

    const all = await search({
      terms: ['bulkterm'],
      k: 25,
      offset: 25,
      actor: 'director',
    });

    expect(all).toMatchObject({ total: 30, truncated: false });
    expect(all.hits).toHaveLength(5);
  });

  it('keeps the reply within 2,500 characters', async () => {
    for (let i = 0; i < 25; i += 1) {
      await put(
        storage,
        `d-${String(700 + i).padStart(4, '0')}`,
        `capword ${'long statement text '.repeat(20)}${i}`,
        {
          tags: ['alpha', 'beta'],
        },
      );
    }

    const reply = await search({ terms: ['capword'], k: 25, actor: 'director' });
    const size = JSON.stringify(
      reply.hits.map(({ id, kind, status, line, tags, why }) => ({
        id,
        kind,
        status,
        line,
        tags,
        why,
      })),
    ).length;

    expect(size).toBeLessThanOrEqual(2500);
    expect(reply.hits.length).toBeLessThan(25);
    expect(reply).toMatchObject({ total: 25, truncated: true });
    expect(reply.hits.every((h) => h.line.length <= 160)).toBe(true);
  });
});

describe('nothing to search for', () => {
  it('answers a question of only filler words with an empty reply', async () => {
    const reply = await search({ text: 'the and of to is', actor: 'director' });

    expect(reply).toEqual({ hits: [], total: 0, truncated: false });
  });

  it('answers no words at all with an empty reply', async () => {
    expect(await search({ actor: 'director' })).toEqual({
      hits: [],
      total: 0,
      truncated: false,
    });
  });
});

describe('tags', () => {
  it('adds records that carry a tag the rewrite found, marked as a tag hit', async () => {
    await put(storage, 'd-0701', 'unrelated wording entirely', { tags: ['special'] });

    const reply = await search({
      terms: ['zzznothing'],
      tag_hints: ['special'],
      actor: 'director',
    });

    expect(reply.hits.map((h) => [h.id, h.why])).toEqual([['d-0701', 'tag']]);
  });

  it('records which kind of match each hit was', async () => {
    const reply = await search({ text: 'sqlite wal', actor: 'director' });

    expect(reply.hits[0]).toMatchObject({
      id: 'd-0102',
      kind: 'decision',
      status: 'active',
      why: 'statement',
    });

    expect(reply.hits[0]?.line.length).toBeLessThanOrEqual(160);
  });

  it('uses the gist as the line when a record has one', async () => {
    await put(
      storage,
      'd-0801',
      'A long statement that a gist summarises for the reader',
      {
        gist: 'short gist line',
        aliases: ['nickname'],
      },
    );

    const reply = await search({ terms: ['nickname'], actor: 'director' });

    expect(reply.hits[0]).toMatchObject({ id: 'd-0801', line: 'short gist line' });
  });
});

describe('web snippets', () => {
  it('are plain text with index ranges for the matched words', async () => {
    const reply = await search({ terms: ['wal'], actor: 'web' });
    const snippet = reply.hits.find((h) => h.id === 'd-0102')?.snippet;

    expect(snippet?.text).toContain('WAL');
    expect(snippet?.text).not.toMatch(/[\u0001\u0002<]/);
    const [start, end] = snippet?.marks[0] ?? [0, 0];
    expect(snippet?.text.slice(start, end).toLowerCase()).toBe('wal');
  });

  it('are absent for the Director and Workers', async () => {
    const reply = await search({ terms: ['wal'], actor: 'director' });

    expect(reply.hits.every((h) => h.snippet === undefined)).toBe(true);
  });
});
