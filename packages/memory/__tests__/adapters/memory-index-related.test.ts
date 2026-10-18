/**
 * Pins which records are shown as related to one record, and in what order.
 *
 * Why: after finding a decision, a Worker or the owner wants the ones around it. Direct edges come first and
 *   in a fixed priority (what it supersedes, amends, reopens, cites), a tag only a few records share says
 *   more than one most records carry, a neighbour that was replaced must lead to its replacement, and under a
 *   Worker's scope nothing outside the slice may appear, not even through a link. The answer is short on
 *   purpose: five entries, three reasons each, 1,200 characters.
 *
 * Pins: amends first with the reason `amends`, both directions named, rare shared tag above common one,
 *   at most five entries and three reasons and 1,200 characters, a superseded neighbour shown with its
 *   successor, the Worker scope hiding what is out of the slice, an unknown id giving null, and the record
 *   itself never listed.
 * Depends on: adapters/sql-memory-index, helpers/corpus, @forge/db, @forge/core, vitest. IO: in-memory SQLite.
 */

import { workerScope } from '@forge/core';
import type { MemoryIndex, StorageAdapter } from '@forge/core';
import { createSqliteStorage } from '@forge/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqlMemoryIndex } from '#/adapters/sql-memory-index/create-sql-memory-index.js';
import { NOW, put, seedCorpus } from '#tests/helpers/corpus.js';

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

const related = (id: string, k = 5, scope?: ReturnType<typeof workerScope>) =>
  index.related(
    'forge',
    id,
    k,
    scope === undefined ? { actor: 'cli' } : { actor: 'worker', scope },
  );

describe('links', () => {
  beforeEach(async () => {
    await put(storage, 'd-1001', 'Root decision about gateway design', {
      tags: ['gateway'],
    });

    await put(storage, 'd-1002', 'Amends the root on token lifetime', {
      tags: ['gateway'],
      links: [{ rel: 'amends', target_kind: 'record', target: 'd-1001' }],
    });

    await put(storage, 'd-1003', 'Cites the root in passing', {
      links: [{ rel: 'cites', target_kind: 'record', target: 'd-1001' }],
    });

    await put(storage, 'd-1004', 'Reopens something about gateway rate limits', {
      links: [{ rel: 'reopens', target_kind: 'record', target: 'd-1001' }],
    });
  });

  it('lists edges in both directions with a plain reason, amends before cites', async () => {
    const near = await related('d-1001');

    expect(near?.map((n) => [n.id, n.reasons[0]])).toEqual([
      ['d-1002', 'amended by'],
      ['d-1004', 'reopened by'],
      ['d-1003', 'cited by'],
    ]);

    const back = await related('d-1002');
    expect(back?.[0]).toMatchObject({
      id: 'd-1001',
      reasons: expect.arrayContaining(['amends']),
    });
  });

  it('puts what a record amends first, before text and tag neighbours', async () => {
    const near = await related('d-1002');

    expect(near?.[0]?.id).toBe('d-1001');
    expect(near?.[0]?.reasons[0]).toBe('amends');
  });

  it('never lists the record itself and fills line, kind and status', async () => {
    const near = await related('d-1001');

    expect(near?.some((n) => n.id === 'd-1001')).toBe(false);
    expect(near?.[0]).toMatchObject({ kind: 'decision', status: 'active' });
    expect(near?.[0]?.line.length).toBeLessThanOrEqual(140);
  });

  it('names records that share a card', async () => {
    await put(storage, 'd-1101', 'Card member alpha', {
      links: [{ rel: 'card', target_kind: 'card', target: 'FG-C9' }],
    });

    await put(storage, 'd-1102', 'Card member beta', {
      links: [{ rel: 'card', target_kind: 'card', target: 'FG-C9' }],
    });

    const first = (await related('d-1101'))?.[0];

    expect(first?.id).toBe('d-1102');
    expect(first?.reasons[0]).toBe('same card');
  });
});

describe('tags', () => {
  it('ranks a rare shared tag above a common one and names the shared tags', async () => {
    await put(storage, 'd-1201', 'Origin record on routing', {
      tags: ['rare-tag', 'filler'],
    });

    await put(storage, 'd-1202', 'Shares only the rare tag', { tags: ['rare-tag'] });
    await put(storage, 'd-1203', 'Shares only the common tag', { tags: ['filler'] });

    const near = await related('d-1201');

    expect(near?.map((n) => n.id)).toContain('d-1202');
    expect(near?.map((n) => n.id)).not.toContain('d-1203');
    expect(near?.find((n) => n.id === 'd-1202')?.reasons).toContain(
      'shares tags: rare-tag',
    );
  });
});

describe('text', () => {
  it('finds a record that says similar things, with the reason similar text', async () => {
    await put(storage, 'd-1301', 'Gizmo calibration happens nightly with quasar sensors');
    await put(storage, 'd-1302', 'Quasar sensors need gizmo calibration weekly');

    expect((await related('d-1301'))?.find((n) => n.id === 'd-1302')?.reasons).toContain(
      'similar text',
    );
  });
});

describe('size and shape', () => {
  it('returns at most five entries, three reasons each and 1,200 characters', async () => {
    await put(storage, 'd-1401', 'Hub record for the size test', { tags: ['hub-tag'] });
    for (let i = 0; i < 12; i += 1) {
      await put(
        storage,
        `d-14${String(10 + i)}`,
        `Spoke ${i} with an unusually long line ${'filler words repeat '.repeat(12)}`,
        {
          tags: ['hub-tag'],
          links: [
            { rel: 'amends', target_kind: 'record', target: 'd-1401' },
            { rel: 'cites', target_kind: 'record', target: 'd-1401' },
            { rel: 'card', target_kind: 'card', target: 'FG-C1' },
          ],
        },
      );
    }

    const near = (await related('d-1401', 9)) ?? [];

    expect(near.length).toBeLessThanOrEqual(5);
    expect(near.every((n) => n.reasons.length <= 3 && n.reasons.length >= 1)).toBe(true);
    expect(JSON.stringify(near).length).toBeLessThanOrEqual(1200);
  });

  it('returns an empty list for a record with no neighbours and null for an unknown id', async () => {
    await put(storage, 'd-1501', 'Utterly alone unrepeated words');

    expect(await related('d-1501')).toEqual([]);
    expect(await related('d-9999')).toBeNull();
  });
});

describe('a neighbour that was replaced', () => {
  beforeEach(async () => {
    await put(storage, 'd-1601', 'Hub that cites an old decision');
    await put(storage, 'd-1602', 'Old decision about transport', {
      status: 'superseded',
      superseded_by: 'd-1603',
    });

    await put(storage, 'd-1603', 'New decision about transport', {
      links: [{ rel: 'supersedes', target_kind: 'record', target: 'd-1602' }],
    });

    await put(storage, 'd-1604', 'Cites the old one', {
      links: [{ rel: 'cites', target_kind: 'record', target: 'd-1602' }],
    });
  });

  it('is shown with its successor beside it, for the owner', async () => {
    const near = await related('d-1604');

    expect(near?.map((n) => n.id).slice(0, 2)).toEqual(['d-1602', 'd-1603']);
    expect(near?.[0]?.line).toContain('(superseded by d-1603)');
    expect(near?.[1]?.status).toBe('active');
  });

  it('leads a Worker to the successor and never shows the old record', async () => {
    const scope = workerScope({ tags: [], include_rejected: false });
    const near = await related('d-1604', 5, scope);

    expect(near?.[0]?.id).toBe('d-1603');
    expect(near?.map((n) => n.id)).not.toContain('d-1602');
  });
});

describe('under a Worker scope', () => {
  it('drops linked records that are outside the slice', async () => {
    await put(storage, 'd-1701', 'Visible hub', { tags: ['db'] });
    await put(storage, 'd-1702', 'Linked but out of slice', {
      tags: ['api'],
      links: [{ rel: 'cites', target_kind: 'record', target: 'd-1701' }],
    });

    await put(storage, 'x-1703', 'Linked proposal', {
      kind: 'proposal',
      tags: ['db'],
      links: [{ rel: 'cites', target_kind: 'record', target: 'd-1701' }],
    });

    await put(storage, 'd-1704', 'Linked and in slice', {
      tags: ['db'],
      links: [{ rel: 'cites', target_kind: 'record', target: 'd-1701' }],
    });

    const scope = workerScope({ tags: ['db'], include_rejected: false });
    const near = await related('d-1701', 5, scope);

    expect(near?.map((n) => n.id)).toContain('d-1704');
    for (const hidden of ['d-1702', 'x-1703']) {
      expect(near?.map((n) => n.id)).not.toContain(hidden);
    }

    expect(await related('d-1702', 5, scope)).toBeNull();
  });
});
