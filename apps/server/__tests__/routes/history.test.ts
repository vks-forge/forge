/**
 * `GET /tickets/:id/history` and `GET /cards/:id/history`.
 *
 * Why: the History tab asks the server "what did this ticket or card go through, and why?" and
 *   expects one ordered list of plain entries. If the route merged the wrong tickets, ignored
 *   paging, or accepted a bad cursor, the tab would show another ticket's story or lose lines.
 *
 * Pins: a ticket's list merges its card events, run and question in time order with reasons as
 *   titles; a card's list has its own phases plus one roll-up line per ticket event carrying the
 *   ticket id; `limit` and `before` page oldest-first with `next_before`; unknown ids are 404 and
 *   malformed ids or queries are 400.
 * Depends on: helpers/card-rig, vitest. IO: a loopback socket.
 */

import type { CardId, HistoryPage, Run } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { at, card, question, startCardRig, ticket } from '#tests/helpers/card-rig.js';
import type { CardRig } from '#tests/helpers/card-rig.js';

let ctx: CardRig;

const CARD = 'FX-C1' as CardId;
const actor = { type: 'director', id: 'engine' } as const;

const move = (
  minute: number,
  ticketId: string,
  from: string,
  to: string,
  reason?: string,
) => ({
  kind: 'ticket_state' as const,
  at: at(minute),
  actor,
  payload: { ticket_id: ticketId, from, to, ...(reason ? { reason } : {}) },
});

const run = (id: string, ticketId: string, minute: number): Run =>
  ({
    id,
    ticket_id: ticketId,
    harness: 'claude',
    driver_version: '1',
    cwd: '/w',
    lane: 'express',
    started_at: at(minute),
    status: 'success',
    owner: 'srv',
  }) as unknown as Run;

beforeEach(async () => {
  ctx = await startCardRig();
  await ctx.seed([card(1)], [ticket(1, 1), ticket(2, 1)]);
  await ctx.storage.transaction(async (tx) => {
    const events = [
      move(
        3,
        'FX-1',
        'planned',
        'in_progress',
        'A Worker slot was free, so a Worker started',
      ),
      move(4, 'FX-2', 'planned', 'in_progress'),
      move(10, 'FX-1', 'in_progress', 'waiting_human'),
      move(
        20,
        'FX-1',
        'waiting_human',
        'in_progress',
        'You answered, so the Worker resumed',
      ),
    ];

    for (const e of events) {
      await tx.cardEvents.append(CARD, e as never);
    }

    await tx.runs.insert(run('r1', 'FX-1', 3));
    await tx.interactions.insert({
      ...question('FX-1'),
      status: 'answered',
      answered_at: at(20),
      answer: { text: 'Use Postgres' },
    });
  });
});

afterEach(async () => {
  await ctx.rig.close();
});

const get = async (path: string) => ctx.rig.json('GET', path);

describe('GET /tickets/:id/history', () => {
  it('merges the ticket events, run and question in time order, leaving other tickets out', async () => {
    const res = await get('/tickets/FX-1/history');
    const page = res.body as HistoryPage;

    expect(res.status).toBe(200);
    expect(page.entries.map((e) => e.title)).toEqual([
      'The Worker asked: which?',
      'A Worker slot was free, so a Worker started',
      'claude started working',
      'Needs you',
      'You answered',
      'You answered, so the Worker resumed',
    ]);

    expect(page.has_more).toBe(false);
  });

  it('pages oldest first with a cursor to older entries', async () => {
    const newest = (await get('/tickets/FX-1/history?limit=2')).body as HistoryPage;

    expect(newest.entries.map((e) => e.title)).toEqual([
      'You answered',
      'You answered, so the Worker resumed',
    ]);

    expect(newest.has_more).toBe(true);

    const older = (
      await get(
        `/tickets/FX-1/history?limit=2&before=${encodeURIComponent(newest.next_before ?? '')}`,
      )
    ).body as HistoryPage;

    // The page keeps the two entries made at the same instant (3 min) together.
    expect(older.entries.map((e) => e.title)).toEqual([
      'A Worker slot was free, so a Worker started',
      'claude started working',
      'Needs you',
    ]);
  });

  it('is 404 for an unknown ticket and 400 for a bad id or query', async () => {
    expect((await get('/tickets/FX-99/history')).status).toBe(404);
    expect((await get('/tickets/nope/history')).status).toBe(400);
    expect((await get('/tickets/FX-1/history?limit=0')).status).toBe(400);
    expect((await get('/tickets/FX-1/history?before=yesterday')).status).toBe(400);
  });
});

describe('GET /cards/:id/history', () => {
  it('rolls each ticket event up as one line that names its ticket', async () => {
    const res = await get('/cards/FX-C1/history');
    const page = res.body as HistoryPage;

    expect(res.status).toBe(200);
    expect(page.entries).toHaveLength(4);
    expect(page.entries.map((e) => e.ticket_id)).toEqual([
      'FX-1',
      'FX-2',
      'FX-1',
      'FX-1',
    ]);

    expect(page.entries[1]?.title).toBe('FX-2: Started');
  });

  it('is 404 for an unknown card and 400 for a bad id', async () => {
    expect((await get('/cards/FX-C99/history')).status).toBe(404);
    expect((await get('/cards/nope/history')).status).toBe(400);
  });
});
