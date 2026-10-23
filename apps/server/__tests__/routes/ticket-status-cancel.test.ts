/**
 * What the ticket page needs to cancel a ticket and to tell the truth about waiting.
 *
 * Why: the owner can only cancel what the page offers, and the page must not say a finished
 *   ticket is "waiting on" a ticket it already got past. The server decides both once, from the
 *   same rules the engine uses, so the page does no guessing: `can_cancel` and the tickets that
 *   would be cancelled with it, and `open_blockers` (empty for any finished ticket). A done card
 *   must not show a ticket it cancelled as unfinished work.
 *
 * Pins: `can_cancel` true while unfinished on an open card, false for done, cancelled and a
 *   closed card; `dependents` lists open tickets waiting on it; `open_blockers` is empty for a
 *   done ticket with a done dependency and lists what is still open for a planned one; the card
 *   summary counts cancelled tickets apart (`tickets_cancelled`) and leaves them out of
 *   `ticket_count`.
 * Depends on: helpers/card-rig, vitest. IO: a loopback socket.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { card, startCardRig, ticket } from '#tests/helpers/card-rig.js';
import type { CardRig } from '#tests/helpers/card-rig.js';

let ctx: CardRig;

beforeEach(async () => {
  ctx = await startCardRig();
});

afterEach(async () => {
  await ctx.rig.close();
});

interface Detail {
  can_cancel: boolean;
  dependents: string[];
  open_blockers: string[];
}

const detail = async (id: string): Promise<Detail> =>
  (await ctx.rig.json('GET', `/tickets/${id}`)).body as Detail;

describe('can_cancel and dependents', () => {
  it('is true while the ticket is unfinished on an open card, with its dependents named', async () => {
    await ctx.seed(
      [card(1, { phase: 'in_progress' })],
      [
        ticket(1, 1, { status: 'in_progress' }),
        ticket(2, 1, { status: 'planned', blocked_by: ['FX-1' as never] }),
        ticket(3, 1, { status: 'planned', blocked_by: ['FX-2' as never] }),
      ],
    );

    expect(await detail('FX-1')).toMatchObject({
      can_cancel: true,
      dependents: ['FX-2', 'FX-3'],
    });

    expect(await detail('FX-3')).toMatchObject({ can_cancel: true, dependents: [] });
  });

  it('is false for finished tickets and for a ticket of a closed card', async () => {
    await ctx.seed(
      [
        card(1, { phase: 'in_progress' }),
        card(2, { phase: 'closed', closed_reason: 'dup' }),
      ],
      [
        ticket(1, 1, { status: 'done' }),
        ticket(2, 1, { status: 'cancelled' }),
        ticket(3, 2, { status: 'in_progress' }),
      ],
    );

    expect((await detail('FX-1')).can_cancel).toBe(false);
    expect((await detail('FX-2')).can_cancel).toBe(false);
    expect((await detail('FX-3')).can_cancel).toBe(false);
  });
});

describe('open_blockers', () => {
  it('is empty for a done ticket whose dependency is done, and lists what is still open otherwise', async () => {
    await ctx.seed(
      [card(1, { phase: 'in_progress' })],
      [
        ticket(1, 1, { status: 'done' }),
        ticket(2, 1, { status: 'done', blocked_by: ['FX-1' as never] }),
        ticket(3, 1, { status: 'in_progress' }),
        ticket(4, 1, {
          status: 'planned',
          blocked_by: ['FX-1' as never, 'FX-3' as never],
        }),
      ],
    );

    expect((await detail('FX-2')).open_blockers).toEqual([]);
    expect((await detail('FX-4')).open_blockers).toEqual(['FX-3']);
  });
});

describe('card roll-up with a cancelled ticket', () => {
  it('counts cancelled tickets apart so a done card reads 2 of 2 done, 1 cancelled', async () => {
    await ctx.seed(
      [card(1, { phase: 'done' })],
      [
        ticket(1, 1, { status: 'done' }),
        ticket(2, 1, { status: 'done' }),
        ticket(3, 1, { status: 'cancelled' }),
      ],
    );

    const body = (await ctx.rig.json('GET', '/cards/FX-C1')).body as Record<
      string,
      unknown
    >;

    expect(body).toMatchObject({
      ticket_count: 2,
      tickets_done: 2,
      tickets_cancelled: 1,
    });
  });
});
