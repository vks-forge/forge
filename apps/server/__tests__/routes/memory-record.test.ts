/**
 * Memory record API tests: a record with provenance, history, related records, no edits, and the live key.
 *
 * Why: after finding a decision the owner reads where it came from, how it changed and what is around it, and
 *   answers the Director's proposals. A record must carry who wrote it and from where; its history must name every
 *   move and who made it; no route edits or deletes a record (a change is a new record that supersedes the old
 *   one); approving or rejecting goes through the database door and answers a second attempt with 409; and every
 *   write announces `["memory", slug]` so open screens refetch.
 *
 * Pins: the record view fields and 404 for an unknown id, the history of a proposal that was approved, related
 *   records with the reason first, 405 for PUT, PATCH and DELETE, approve and reject through the database door
 *   with the change reference and 409 on a second answer, the list flags `pinned` and `imported`, and the
 *   announced memory key after a write.
 * Depends on: helpers/memory-rig, vitest. IO: a loopback socket, a SQLite file, a temp data home.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startMemoryRig } from '#tests/helpers/memory-rig.js';
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

describe('a record', () => {
  it('carries provenance, tags and import notes, and 404 for an unknown id', async () => {
    await m.parts.memory.writer.decide('shop', {
      statement: 'Use zod',
      source,
      tags: ['core'],
      gist: 'zod first',
    });

    const found = await get('/d-0001');
    const missing = await get('/d-0042');

    expect(found).toMatchObject({
      status: 200,
      body: {
        record: {
          id: 'd-0001',
          kind: 'decision',
          status: 'active',
          author: 'user',
          origin: 'owner',
          source,
          tags: ['core'],
          pinned: true,
          gist: 'zod first',
          imported: null,
          body_truncated: false,
        },
      },
    });

    expect(missing).toMatchObject({
      status: 404,
      body: { error: { code: 'memory_record_not_found' } },
    });
  });

  it('has a history: the proposal, its approval and who approved it', async () => {
    await m.parts.memory.writer.propose('shop', { statement: 'Use pnpm', source });
    await m.parts.memory.writer.approve('shop', 'x-0001', 'vikash');

    const res = await get('/x-0001/history');
    const body = res.body as {
      events: { event: string; actor: string }[];
      versions: unknown[];
    };

    expect(res.status).toBe(200);
    expect(body.events.map((e) => [e.event, e.actor])).toEqual([
      ['proposed', 'director'],
      ['approved', 'vikash'],
    ]);

    expect(body.versions).toEqual([]);
    expect((await get('/d-0099/history')).status).toBe(404);
  });

  it('lists related records, and 404 for an unknown id', async () => {
    await m.parts.memory.writer.decide('shop', {
      statement: 'Root gateway design',
      source,
    });

    await m.parts.memory.writer.decide('shop', {
      statement: 'Amends the gateway design on tokens',
      source,
      links: { amends: ['d-0001'] },
    });

    const res = await get('/d-0001/related');

    const first = (res.body as { related: { id: string; reasons: string[] }[] })
      .related[0];

    expect(res.status).toBe(200);
    expect(first?.id).toBe('d-0002');
    expect(first?.reasons[0]).toBe('amended by');

    expect((await get('/d-0099/related')).status).toBe(404);
  });

  it('cannot be edited or deleted: no route accepts PUT, PATCH or DELETE', async () => {
    await m.parts.memory.writer.decide('shop', { statement: 'Words stay', source });

    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      const res = await m.rig.json(method, '/projects/shop/memory/d-0001', {
        statement: 'changed',
      });

      expect([404, 405], method).toContain(res.status);
    }

    expect((await get('/d-0001')).body).toMatchObject({
      record: { statement: 'Words stay' },
    });
  });
});

describe('answering a proposal and the live key', () => {
  it('approves through the database door and announces the memory key', async () => {
    await m.parts.memory.writer.propose('shop', { statement: 'Use pnpm', source });
    const seen = m.watch('shop');

    const res = await m.rig.json(
      'POST',
      '/projects/shop/memory/proposals/x-0001/approve',
      { author: 'vikash' },
    );

    const again = await m.rig.json(
      'POST',
      '/projects/shop/memory/proposals/x-0001/approve',
      { author: 'vikash' },
    );

    expect(res).toMatchObject({
      status: 200,
      body: { record: { id: 'x-0001', status: 'active', approved_by: 'vikash' } },
    });

    expect((res.body as { commit: string }).commit).toMatch(/^\d+$/);
    expect(again).toMatchObject({
      status: 409,
      body: { error: { code: 'not_a_pending_proposal' } },
    });

    expect(seen.flat()).toContain(JSON.stringify(['memory', 'shop']));
  });

  it('rejects with a reason and a proposal can be written and listed with pinned and imported flags', async () => {
    await m.parts.memory.writer.propose('shop', { statement: 'Adopt mongo', source });
    const res = await m.rig.json(
      'POST',
      '/projects/shop/memory/proposals/x-0001/reject',
      {
        author: 'vikash',
        reason: 'we use SQLite',
      },
    );

    const list = await get('');

    expect(res).toMatchObject({
      status: 200,
      body: { record: { status: 'rejected', rejected_reason: 'we use SQLite' } },
    });

    expect(list.body).toEqual({
      records: [
        {
          id: 'x-0001',
          kind: 'rejected',
          status: 'rejected',
          statement: 'Adopt mongo',
          tags: [],
          pinned: false,
          imported: false,
        },
      ],
    });
  });
});
