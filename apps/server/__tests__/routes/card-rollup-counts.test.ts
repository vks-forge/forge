/**
 * The card summary's running and waiting-for-you ticket counts.
 *
 * Why: a Board card tile says "2 running · 1 waiting for you" without fetching its tickets. A
 *   count that included a ticket whose question the Director still holds would send the owner
 *   to a card with nothing for them to do; one that missed finished work in review would hide it.
 *
 * Pins: running counts in-progress and verifying tickets; waiting counts review, sign-off and
 *   blocked by status and a waiting_human ticket only while an owner question is open; the
 *   card detail returns the same counts.
 * Depends on: helpers/card-rig, vitest. IO: a loopback socket.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { card, question, startCardRig, ticket } from '#tests/helpers/card-rig.js';
import type { CardRig } from '#tests/helpers/card-rig.js';

let ctx: CardRig;

beforeEach(async () => {
  ctx = await startCardRig();
  await ctx.seed(
    [card(1, { phase: 'in_progress' })],
    [
      ticket(1, 1, { status: 'in_progress' }),
      ticket(2, 1, { status: 'verifying' }),
      ticket(3, 1, { status: 'review' }),
      ticket(4, 1, { status: 'waiting_human' }),
      ticket(5, 1, { status: 'waiting_human' }),
      ticket(6, 1, { status: 'done' }),
    ],
  );

  await ctx.storage.transaction((tx) => tx.interactions.insert(question('FX-4')));
});

afterEach(async () => {
  await ctx.rig.close();
});

describe('card summary roll-up counts', () => {
  it('counts running tickets and those waiting on the owner, on the list and the detail', async () => {
    const list = (await ctx.rig.json('GET', '/projects/fixture/cards')).body as {
      items: { id: string; tickets_running: number; tickets_waiting_you: number }[];
    };

    const detail = (await ctx.rig.json('GET', '/cards/FX-C1')).body as {
      tickets_running: number;
      tickets_waiting_you: number;
    };

    expect(list.items[0]).toMatchObject({ tickets_running: 2, tickets_waiting_you: 2 });
    expect(detail).toMatchObject({ tickets_running: 2, tickets_waiting_you: 2 });
  });
});
