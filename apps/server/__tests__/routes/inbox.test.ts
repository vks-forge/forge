/**
 * Inbox API against in-memory storage: list views, counts, marks and resurfacing (d-0116).
 *
 * Why: the Inbox is where the owner learns what needs them. Wrong views hide a question that
 *   waits on them, a mark that survived a change would bury a failed gate that happened
 *   after the owner archived the item, counts that disagree with the list make the sidebar
 *   badge lie, and marks leaking across projects would clear another team's inbox.
 *
 * Pins: items derived from interactions, review / sign-off tickets, failed gates, memory
 *   proposals and parked harnesses; the four views; read / unread / archive / unarchive;
 *   resurfacing when the source changes after a mark; counts; paging; 404 project / item,
 *   400 view / cursor, 401; project isolation of items and marks.
 * Depends on: helpers/read-rig. IO: a loopback socket.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeRun, makeTicket, startReadRig } from '#tests/helpers/read-rig.js';
import type { ReadRig } from '#tests/helpers/read-rig.js';

let t: ReadRig;

const get = (path: string) => t.rig.json('GET', path);
const post = (path: string) => t.rig.json('POST', path);

interface Item {
  id: string;
  kind: string;
  needs_action: boolean;
  read: boolean;
  archived: boolean;
  updated_at: string;
}
interface Page {
  items: Item[];
  nextCursor: string | null;
}

const ids = async (view: string, project = 'fixture'): Promise<string[]> =>
  ((await get(`/projects/${project}/inbox?view=${view}`)).body as Page).items.map(
    (i) => i.id,
  );

beforeEach(async () => {
  t = await startReadRig();
  await t.storage.transaction(async (tx) => {
    await tx.tickets.insert(
      makeTicket('FX', 1, {
        status: 'waiting_human',
        updated_at: '2026-10-16T05:00:00.000Z',
      }),
    );

    await tx.tickets.insert(
      makeTicket('FX', 2, { status: 'review', updated_at: '2026-10-16T04:00:00.000Z' }),
    );

    await tx.tickets.insert(
      makeTicket('FX', 3, {
        status: 'in_progress',
        updated_at: '2026-10-16T03:00:00.000Z',
      }),
    );

    await tx.tickets.insert(makeTicket('OT', 1, { status: 'review' }));
    await tx.runs.insert(makeRun('r1', 'FX-3', { status: 'running' }));
    await tx.interactions.insert({
      id: 'int-1',
      ticket_id: 'FX-1',
      kind: 'question',
      payload: { prompt: 'Which database?' },
      status: 'pending',
      asked_at: '2026-10-16T05:00:00.000Z',
      timeout_at: '2026-10-17T00:00:00.000Z',
    });

    await tx.gateResults.insert({
      run_id: 'r1',
      gate: 'G1',
      status: 'failed',
      started_at: '2026-10-16T02:00:00.000Z',
      ended_at: '2026-10-16T02:01:00.000Z',
    });
  });
});

afterEach(async () => {
  await t.close();
});

describe('GET /projects/:slug/inbox', () => {
  it('derives items from questions, tickets and gates, needs_action by default', async () => {
    const res = await get('/projects/fixture/inbox');
    const page = res.body as Page;

    expect(res.status).toBe(200);
    expect(page.items.map((i) => i.id)).toEqual(['question:int-1', 'ticket_review:FX-2']);
    expect(page.items[0]).toMatchObject({
      title: 'Which database?',
      ticket_id: 'FX-1',
      needs_action: true,
      read: false,
      archived: false,
    });
  });

  it('shows informing items only in all and unread, and a parked ticket through its question', async () => {
    const all = await ids('all');

    expect(all).toContain('gate_failed:1');
    expect(all).not.toContain('ticket_waiting:FX-1');
    expect(await ids('needs_action')).not.toContain('gate_failed:1');
  });

  it('lists memory proposals and parked harnesses', async () => {
    t.proposals = [
      {
        id: 'x-0001',
        kind: 'proposal',
        status: 'pending',
        statement: 'Use pnpm',
        tags: [],
      },
      { id: 'd-0001', kind: 'decision', status: 'active', statement: 'Old', tags: [] },
    ];

    await t.storage.transaction((tx) =>
      tx.harnessState.upsert({
        harness_id: 'claude',
        paused_until: '2026-10-16T18:00:00.000Z',
        reason: 'quota',
        updated_at: '2026-10-16T10:00:00.000Z',
      }),
    );

    const all = await ids('all');

    expect(all).toContain('memory_proposal:x-0001');
    expect(all).not.toContain('memory_proposal:d-0001');
    expect(all).toContain('quota_wait:claude');
  });

  it('pages with a cursor without repeating or skipping', async () => {
    const first = (await get('/projects/fixture/inbox?view=all&limit=2')).body as Page;
    const second = (
      await get(`/projects/fixture/inbox?view=all&limit=2&cursor=${first.nextCursor}`)
    ).body as Page;

    expect(first.items).toHaveLength(2);
    expect(second.items.map((i) => i.id)).toEqual(['gate_failed:1']);
    expect(second.nextCursor).toBeNull();
  });

  it('never shows another project, 404s an unknown one, 400s bad parameters, needs the token', async () => {
    expect(await ids('all', 'other')).toEqual(['ticket_review:OT-1']);
    expect((await get('/projects/nope/inbox')).status).toBe(404);
    expect((await get('/projects/fixture/inbox?view=sideways')).status).toBe(400);
    expect((await get('/projects/fixture/inbox?cursor=junk')).status).toBe(400);

    const open = await t.rig.json('GET', '/projects/fixture/inbox', undefined, {
      authorization: '',
    });

    expect(open.status).toBe(401);
  });
});

describe('inbox marks', () => {
  it('reads and unreads an item', async () => {
    const read = await post('/projects/fixture/inbox/question%3Aint-1/read');

    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ id: 'question:int-1', read: true });
    expect(await ids('unread')).not.toContain('question:int-1');

    await post('/projects/fixture/inbox/question%3Aint-1/unread');

    expect(await ids('unread')).toContain('question:int-1');
  });

  it('archives and unarchives an item, moving it between views', async () => {
    await post('/projects/fixture/inbox/ticket_review%3AFX-2/archive');

    expect(await ids('needs_action')).not.toContain('ticket_review:FX-2');
    expect(await ids('archived')).toEqual(['ticket_review:FX-2']);

    await post('/projects/fixture/inbox/ticket_review%3AFX-2/unarchive');

    expect(await ids('archived')).toEqual([]);
  });

  it('resurfaces an archived, read item when its source changes afterwards', async () => {
    await post('/projects/fixture/inbox/ticket_review%3AFX-2/read');
    await post('/projects/fixture/inbox/ticket_review%3AFX-2/archive');
    await t.storage.transaction(async (tx) => {
      const current = await tx.tickets.get('FX-2' as never);
      await tx.tickets.updateTicketCas('FX-2' as never, current?.status_version ?? 0, {
        updated_at: '2026-10-16T09:00:00.000Z',
      });
    });

    const back = (
      (await get('/projects/fixture/inbox?view=needs_action')).body as Page
    ).items.find((i) => i.id === 'ticket_review:FX-2');

    expect(back).toMatchObject({ read: false, archived: false });
    expect(await ids('archived')).toEqual([]);
  });

  it('keeps marks per project and 404s an item that is not in the inbox', async () => {
    await post('/projects/fixture/inbox/ticket_review%3AFX-2/archive');

    expect(await ids('needs_action', 'other')).toEqual(['ticket_review:OT-1']);
    expect((await post('/projects/fixture/inbox/question%3Anope/read')).status).toBe(404);
    expect((await post('/projects/fixture/inbox/junk/read')).status).toBe(404);
    expect((await post('/projects/nope/inbox/question%3Aint-1/read')).status).toBe(404);

    const open = await t.rig.json(
      'POST',
      '/projects/fixture/inbox/question%3Aint-1/read',
      undefined,
      { authorization: '' },
    );

    expect(open.status).toBe(401);
  });
});

describe('GET /projects/:slug/inbox/counts', () => {
  it('counts each view and follows the marks', async () => {
    const before = await get('/projects/fixture/inbox/counts');

    expect(before.status).toBe(200);
    expect(before.body).toEqual({ needs_action: 2, unread: 3, all: 3, archived: 0 });

    await post('/projects/fixture/inbox/ticket_review%3AFX-2/archive');
    await post('/projects/fixture/inbox/question%3Aint-1/read');

    expect((await get('/projects/fixture/inbox/counts')).body).toEqual({
      needs_action: 1,
      unread: 1,
      all: 2,
      archived: 1,
    });
  });

  it('404s an unknown project and needs the token', async () => {
    expect((await get('/projects/nope/inbox/counts')).status).toBe(404);

    const open = await t.rig.json('GET', '/projects/fixture/inbox/counts', undefined, {
      authorization: '',
    });

    expect(open.status).toBe(401);
  });
});
