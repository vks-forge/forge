/**
 * Inbox "Mark all read" API: POST /projects/:slug/inbox/read-all (d-0116).
 *
 * Why: when news piles up the owner clears it in one click. The bulk mark must clear exactly the
 *   view asked for (never a question that waits on a decision when only Notices was named), count
 *   what it changed so the screen can say "Marked 5 read", stay inside one project, and leave the
 *   resurface rule intact: a notice that changes after the bulk mark comes back unread.
 *
 * Pins: notices bulk-read leaves needs-action items unread; unread bulk-read clears everything
 *   visible; the count excludes items already read; marks are per project; a changed source
 *   resurfaces; 400 for a bad body or view, 404 unknown project, 401 without the token.
 * Depends on: helpers/read-rig. IO: a loopback socket.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeRun, makeTicket, startReadRig } from '#tests/helpers/read-rig.js';
import type { ReadRig } from '#tests/helpers/read-rig.js';

let t: ReadRig;

interface Item {
  id: string;
  read: boolean;
}

const READ_ALL = '/projects/fixture/inbox/read-all';
const post = (path: string, body?: unknown) => t.rig.json('POST', path, body);
const items = async (view: string): Promise<Item[]> =>
  (
    (await t.rig.json('GET', `/projects/fixture/inbox?view=${view}`)).body as {
      items: Item[];
    }
  ).items;

beforeEach(async () => {
  t = await startReadRig();
  await t.storage.transaction(async (tx) => {
    await tx.tickets.insert(makeTicket('FX', 2, { status: 'review' }));
    await tx.tickets.insert(makeTicket('FX', 3, { status: 'in_progress' }));
    await tx.tickets.insert(makeTicket('OT', 3, { status: 'in_progress' }));
    await tx.runs.insert(makeRun('r1', 'FX-3', { status: 'running' }));
    await tx.runs.insert(makeRun('r2', 'OT-3', { status: 'running' }));
    for (const [run, at] of [
      ['r1', '2026-10-16T02:00:00.000Z'],
      ['r2', '2026-10-16T02:00:00.000Z'],
    ] as const) {
      await tx.gateResults.insert({
        run_id: run,
        gate: 'G1',
        status: 'failed',
        started_at: at,
        ended_at: at,
      });
    }
  });
});

afterEach(async () => {
  await t.close();
});

describe('POST /projects/:slug/inbox/read-all', () => {
  it('marks every notice read and leaves work that waits on the owner unread', async () => {
    const res = await post(READ_ALL, { view: 'notices' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ marked: 1 });
    expect((await items('notices')).every((i) => i.read)).toBe(true);
    expect((await items('needs_action')).map((i) => i.read)).toEqual([false]);
  });

  it('counts only what it changed, so a second call marks nothing', async () => {
    await post(READ_ALL, { view: 'notices' });

    expect((await post(READ_ALL, { view: 'notices' })).body).toEqual({ marked: 0 });
  });

  it('clears the whole unread view, and the sidebar counts follow', async () => {
    expect((await post(READ_ALL, { view: 'unread' })).body).toEqual({ marked: 2 });
    expect(await items('unread')).toEqual([]);
    expect(
      (await t.rig.json('GET', '/projects/fixture/inbox/counts')).body,
    ).toMatchObject({
      unread: 0,
      notices: 1,
      needs_action: 1,
    });
  });

  it('keeps the marks inside the project', async () => {
    await post(READ_ALL, { view: 'unread' });

    const other = (await t.rig.json('GET', '/projects/other/inbox?view=unread')).body as {
      items: Item[];
    };

    expect(other.items.length).toBeGreaterThan(0);
  });

  it('lists a notice that appears after the bulk mark as unread', async () => {
    await post(READ_ALL, { view: 'notices' });
    await t.storage.transaction((tx) =>
      tx.gateResults.insert({
        run_id: 'r1',
        gate: 'G2',
        status: 'failed',
        started_at: '2026-10-17T02:00:00.000Z',
        ended_at: '2026-10-17T02:01:00.000Z',
      }),
    );

    expect((await items('notices')).filter((i) => !i.read)).toHaveLength(1);
  });

  it('refuses a bad view or body, an unknown project and a missing token', async () => {
    expect((await post(READ_ALL, { view: 'all' })).status).toBe(400);
    expect((await post(READ_ALL, { view: 'notices', extra: 1 })).status).toBe(400);
    expect((await post(READ_ALL)).status).toBe(400);
    expect(
      (await post('/projects/nope/inbox/read-all', { view: 'notices' })).status,
    ).toBe(404);

    const open = await t.rig.json(
      'POST',
      READ_ALL,
      { view: 'notices' },
      { authorization: '' },
    );

    expect(open.status).toBe(401);
  });
});
