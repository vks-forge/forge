/**
 * The Inbox items of a card's budget warnings.
 *
 * Why: a card that reaches 80 percent of its budget must tell the owner where they look (d-0143), once, without
 *   stopping anything. The item is derived from the card's `budget_warning` events: one per threshold, needing
 *   attention, acknowledged by archiving (the Inbox's own mark), gone once the card is closed, and moot once the
 *   owner changed the cap the warning was written for. A new threshold of a new cap shows again even after an
 *   earlier warning was archived.
 *
 * Pins: the item (id, title, detail, needs action, dated by the event), archive hides it, a changed cap hides
 *   the old warning and a fresh one shows, a closed or done card shows nothing, other projects are untouched.
 * Depends on: helpers/card-rig, vitest. IO: a loopback socket.
 */

import type { CardId } from '@forge/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { at, card, startCardRig } from '#tests/helpers/card-rig.js';
import type { CardRig } from '#tests/helpers/card-rig.js';

let ctx: CardRig;

interface Item {
  id: string;
  kind: string;
  title: string;
  detail?: string;
  needs_action: boolean;
  archived: boolean;
  updated_at: string;
}

const list = async (view = 'all', project = 'fixture'): Promise<Item[]> =>
  (
    (await ctx.rig.json('GET', `/projects/${project}/inbox?view=${view}`)).body as {
      items: Item[];
    }
  ).items.filter((i) => i.kind === 'budget_warning');

const warn = (n: number, threshold: number, spent: number, cap: number, minute: number) =>
  ctx.storage.transaction((tx) =>
    tx.cardEvents.append(`FX-C${n}` as CardId, {
      kind: 'budget_warning',
      at: at(minute),
      actor: { type: 'director', id: 'engine' },
      payload: { threshold, spent_usd: spent, cap_usd: cap },
    }),
  );

beforeEach(async () => {
  ctx = await startCardRig();
  await ctx.seed([
    card(1, { title: 'Todo app', budget_cap_usd: 5, phase: 'in_progress' }),
  ]);
});

afterEach(async () => {
  await ctx.rig.close();
});

describe('budget_warning items', () => {
  it('shows one item per threshold, needing attention, dated by the warning', async () => {
    await warn(1, 0.8, 4.2, 5, 10);
    await warn(1, 1, 5.1, 5, 12);

    const items = await list();

    expect(items.map((i) => i.id).sort()).toEqual([
      'budget_warning:FX-C1:0.8',
      'budget_warning:FX-C1:1',
    ]);

    const first = items.find((i) => i.id.endsWith(':0.8'));
    expect(first).toMatchObject({
      title: 'Card Todo app reached 80% of its budget',
      detail: '$4.20 of $5.00',
      needs_action: true,
      archived: false,
      updated_at: at(10),
    });

    expect(items.find((i) => i.id.endsWith(':1'))?.title).toBe(
      'Card Todo app reached 100% of its budget',
    );
  });

  it('is acknowledged by archiving and does not come back for the same warning', async () => {
    await warn(1, 0.8, 4.2, 5, 10);

    const archive = await ctx.rig.json(
      'POST',
      '/projects/fixture/inbox/budget_warning:FX-C1:0.8/archive',
    );

    expect(archive.status).toBe(200);
    expect(await list('needs_action')).toEqual([]);
    expect((await list('archived')).map((i) => i.id)).toEqual([
      'budget_warning:FX-C1:0.8',
    ]);
  });

  it('hides a warning written for an earlier cap and shows the fresh one for the new cap', async () => {
    await warn(1, 0.8, 4.2, 5, 10);
    await ctx.storage.transaction((tx) =>
      tx.cards.update('FX-C1' as CardId, { budget_cap_usd: 10, updated_at: at(20) }),
    );

    expect(await list()).toEqual([]);

    await warn(1, 0.8, 8.1, 10, 25);
    const [item, ...rest] = await list();

    expect(rest).toEqual([]);
    expect(item).toMatchObject({ detail: '$8.10 of $10.00', updated_at: at(25) });
  });

  it('shows an archived threshold again when a newer warning for it is written', async () => {
    await warn(1, 0.8, 4.2, 5, 10);
    await ctx.rig.json(
      'POST',
      '/projects/fixture/inbox/budget_warning:FX-C1:0.8/archive',
    );

    await ctx.storage.transaction((tx) =>
      tx.cards.update('FX-C1' as CardId, { budget_cap_usd: 6, updated_at: at(20) }),
    );

    await warn(1, 0.8, 4.9, 6, 30);

    expect((await list('needs_action')).map((i) => i.updated_at)).toEqual([at(30)]);
  });

  it('shows nothing for a closed or finished card, nor for another project', async () => {
    await ctx.seed([
      card(2, { budget_cap_usd: 5, phase: 'done' }),
      card(3, { budget_cap_usd: 5, closed_reason: 'dup', phase: 'closed' }),
      card(4, { project: 'other', budget_cap_usd: 5, phase: 'in_progress' }),
    ]);

    await warn(2, 0.8, 4.2, 5, 10);
    await warn(3, 0.8, 4.2, 5, 10);
    await warn(4, 0.8, 4.2, 5, 10);

    expect(await list()).toEqual([]);
    expect((await list('all', 'other')).map((i) => i.id)).toEqual([
      'budget_warning:FX-C4:0.8',
    ]);
  });
});
