/**
 * The card reads' derived fields: column, Needs you overlay and dependencies.
 *
 * Why: the Board is built from `GET /projects/:slug/cards` and the Card page from `GET /cards/:id`,
 *   and the web client reads one contract from both (d-0139): the column rolled up from the
 *   stored phase and what waits on the owner, the effective `needs_you`, the CAS version, the
 *   priority, links and the two dependency lists. A column taken from tickets alone would show
 *   an unplanned card as running; a `needs_you` that ignored a waiting ticket would hide the
 *   owner answer; a missing `blocks` would break the dependency chips.
 *
 * Pins: each phase column, the own flag and a waiting ticket both giving needs_you, closed
 *   winning, and the contract fields plus both dependency directions on list and detail.
 * Depends on: helpers/card-rig, vitest. IO: a loopback socket.
 */

import type { CardId } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { at, card, question, startCardRig, ticket } from '#tests/helpers/card-rig.js';
import type { CardRig } from '#tests/helpers/card-rig.js';

let ctx: CardRig;

const seed: CardRig['seed'] = (cards, tickets) => ctx.seed(cards, tickets);
const get = (path: string) => ctx.rig.json('GET', path);

interface Page {
  items: { id: string; column: string }[];
}

beforeEach(async () => {
  ctx = await startCardRig();
});

afterEach(async () => {
  await ctx.rig.close();
});

describe('card column and overlay on the reads', () => {
  it('rolls each card up into its column from its phase, its flag and its tickets and questions', async () => {
    await seed(
      [
        card(1, { phase: 'grilling' }),
        card(2, { phase: 'in_progress' }),
        card(3, { phase: 'in_progress' }),
        card(4, { phase: 'done' }),
        card(5, { phase: 'plan_ready', needs_you: true }),
        card(6, { phase: 'closed', closed_reason: 'dup' }),
        card(7, { phase: 'approved' }),
      ],
      [
        ticket(2, 2, { status: 'in_progress' }),
        ticket(3, 3, { status: 'review' }),
        ticket(4, 4, { status: 'done' }),
      ],
    );

    const body = (await get('/projects/fixture/cards')).body as Page;
    const columns = Object.fromEntries(body.items.map((i) => [i.id, i.column]));

    expect(columns).toEqual({
      'FX-C1': 'shaping',
      'FX-C2': 'in_progress',
      'FX-C3': 'needs_you',
      'FX-C4': 'done',
      'FX-C5': 'needs_you',
      'FX-C6': 'closed',
      'FX-C7': 'queued',
    });

    expect(body.items.find((i) => i.id === 'FX-C2')).toMatchObject({
      ticket_count: 1,
      tickets_done: 0,
      project: 'fixture',
    });
  });

  it('carries phase, the effective needs_you, version, priority, links and dependencies on every card', async () => {
    await seed(
      [
        card(1, {
          phase: 'in_progress',
          phase_version: 3,
          priority: 'urgent',
          links: ['https://example.com/spec'],
        }),
        card(2),
        card(3),
      ],
      [ticket(1, 1, { status: 'waiting_human' })],
    );

    await ctx.storage.transaction(async (tx) => {
      await tx.cardRelations.add(
        { from: 'FX-C1' as CardId, to: 'FX-C2' as CardId, kind: 'depends_on' },
        at(1),
      );

      await tx.cardRelations.add(
        { from: 'FX-C3' as CardId, to: 'FX-C1' as CardId, kind: 'depends_on' },
        at(1),
      );
    });

    // The waiting ticket has an open question with the owner; without one the card would not be Needs you.
    await ctx.storage.transaction((tx) => tx.interactions.insert(question('FX-1')));

    const list = (await get('/projects/fixture/cards')).body as {
      items: Record<string, unknown>[];
    };

    const one = list.items.find((i) => i['id'] === 'FX-C1');
    const detail = (await get('/cards/FX-C1')).body;

    const expected = {
      phase: 'in_progress',
      needs_you: true,
      phase_version: 3,
      priority: 'urgent',
      links: ['https://example.com/spec'],
      depends_on: ['FX-C2'],
      blocks: ['FX-C3'],
      column: 'needs_you',
    };

    expect(one).toMatchObject(expected);
    expect(detail).toMatchObject(expected);
    expect(list.items.find((i) => i['id'] === 'FX-C2')).toMatchObject({
      needs_you: false,
      depends_on: [],
      blocks: ['FX-C1'],
    });
  });
});
