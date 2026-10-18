/**
 * Memory search API tests: validation, filters, snippets, successors and the files-backed fallback.
 *
 * Why: the owner finds a decision by its words. Search must validate its query before it reaches the index (a
 *   hostile or oversized query is a 400, never a guess), must answer for the owner without a Director rewrite or a
 *   scope, and must say plainly when a project's memory has not moved into the database yet (409, so the screen can
 *   fall back to its own filter). A search for a replaced decision answers with the decision that replaced it.
 *
 * Pins: search results with snippets as text and index ranges, filters (kind, status, tag, superseded, k,
 *   offset), 400 for a bad query, hostile text answered 200, 404 for an unknown project, 409 `memory_not_migrated`.
 * Depends on: helpers/memory-rig, vitest. IO: a loopback socket, a SQLite file, a temp data home, `git`.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { oldRepo, startMemoryRig } from '#tests/helpers/memory-rig.js';
import type { MemoryRig } from '#tests/helpers/memory-rig.js';

let m: MemoryRig;
const source = { type: 'chat', ref: 'the owner said so' } as const;
const get = (path: string) => m.rig.json('GET', `/projects/shop/memory${path}`);

beforeEach(async () => {
  m = await startMemoryRig();
  await m.addProject('shop');
});

afterEach(async () => {
  await m.close();
});

describe('GET /projects/:slug/memory/search', () => {
  beforeEach(async () => {
    const w = m.parts.memory.writer;
    await w.decide('shop', {
      statement: 'Run the SQLite database in WAL mode',
      source,
      tags: ['db'],
    });

    await w.decide('shop', {
      statement: 'Webhook intake must be idempotent',
      source,
      tags: ['intake'],
    });

    await w.supersede('shop', 'd-0001', {
      statement: 'Run SQLite in WAL mode with FULL sync',
      source,
      tags: ['db'],
    });

    await w.propose('shop', { statement: 'Adopt SQLite extensions for search', source });
  });

  it('answers hits with a line, tags, why and a text snippet with index ranges', async () => {
    const res = await get('/search?q=wal');
    const body = res.body as {
      hits: { id: string; snippet?: { text: string; marks: number[][] } }[];
      total: number;
      truncated: boolean;
    };

    expect(res.status).toBe(200);
    expect(body.hits.map((h) => h.id)).toContain('d-0003');
    expect(body.total).toBeGreaterThan(0);
    expect(body.truncated).toBe(false);

    const snippet = body.hits.find((h) => h.id === 'd-0003')?.snippet;
    expect(snippet?.text).toContain('WAL');
    expect(snippet?.text).not.toMatch(/[\u0001\u0002<]/);
    const [start, end] = snippet?.marks[0] ?? [0, 0];
    expect(snippet?.text.slice(start, end).toLowerCase()).toBe('wal');
  });

  it('filters by tag, kind and status, and pages', async () => {
    const tagged = await get('/search?q=sqlite&tag=db');
    const proposals = await get('/search?q=sqlite&kind=proposal&status=pending');
    const paged = await get('/search?q=sqlite&k=1&offset=0');

    expect(
      (tagged.body as { hits: { id: string }[] }).hits.every((h) =>
        ['d-0003'].includes(h.id),
      ),
    ).toBe(true);

    expect((proposals.body as { hits: { id: string }[] }).hits.map((h) => h.id)).toEqual([
      'x-0001',
    ]);

    expect((paged.body as { hits: unknown[]; truncated: boolean }).hits).toHaveLength(1);
  });

  it('replaces a superseded decision by its successor and shows the old one when asked', async () => {
    const replaced = await get('/search?q=database');
    const shown = await get('/search?q=database&superseded=1');

    expect(
      (replaced.body as { hits: { id: string; replaced_by?: string }[] }).hits[0],
    ).toMatchObject({
      id: 'd-0003',
      replaced_by: 'd-0001',
    });

    expect((shown.body as { hits: { id: string }[] }).hits.map((h) => h.id)).toContain(
      'd-0001',
    );
  });

  it('answers 400 with the issues for a missing, empty or oversized query and for unknown words', async () => {
    for (const q of [
      '',
      '?q=',
      `?q=${'x'.repeat(201)}`,
      '?q=a&kind=note',
      '?q=a&status=maybe',
      '?q=a&k=26',
      '?q=a&k=0',
      '?q=a&offset=-1',
      '?q=a&superseded=2',
    ]) {
      const res = await get(`/search${q === '' ? '' : q.startsWith('?') ? q : `?${q}`}`);

      expect(res.status, q).toBe(400);
      expect(res.body).toMatchObject({ error: { code: 'invalid_request' } });
    }
  });

  it('never fails on hostile text', async () => {
    for (const q of [
      'a" OR "b',
      'NEAR(',
      '*',
      '-',
      'col:val',
      "'; DROP TABLE memory_records;--",
    ]) {
      const res = await get(`/search?q=${encodeURIComponent(q)}`);

      expect(res.status, q).toBe(200);
    }
  });

  it('answers 404 for an unknown project and 409 memory_not_migrated for one still on its old repository', async () => {
    const ghost = await m.rig.json('GET', '/projects/ghost/memory/search?q=x');
    await m.close();
    m = await startMemoryRig((home) => {
      oldRepo(home.memoryDir, 'shop', { 'decisions/bad.md': 'no header at all\n' });
    });

    await m.addProject('shop');
    await m.parts.migration.migrateAll(['shop']);
    const files = await get('/search?q=x');

    expect(ghost).toMatchObject({
      status: 404,
      body: { error: { code: 'project_not_found' } },
    });

    expect(files).toMatchObject({
      status: 409,
      body: { error: { code: 'memory_not_migrated' } },
    });
  });
});
