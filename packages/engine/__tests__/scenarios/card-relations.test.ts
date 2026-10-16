/**
 * Scenario: editing the dependencies of a card after it exists.
 *
 * Why: the card page lets the owner change "depends on" and "blocks" (d-0129). The body is the
 *   complete set of the card, so an edge left out is removed in both directions, and the same
 *   checks as creation must hold: every id a card of this project and no loop through the other
 *   cards (d-0141). A refused edit must keep the old edges, and an accepted one leaves a note.
 *
 * Pins: replacement in both directions with a note, clearing, keeping an unchanged edge, a loop
 *   refused with the old edges intact, "complete set" semantics, and refusals for itself, an
 *   unknown card, another project and an unknown target.
 * Depends on: helpers/rig, @forge/core types, vitest.
 */

import type { CardId } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { makeRig } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';
import type { CreateCardInput } from '#/types/card-create.types.js';

const input = (over: Partial<CreateCardInput> = {}): CreateCardInput => ({
  project: 'forge',
  title: 'A todo application',
  description: 'Build a small todo application with a list and a form.',
  type: 'plan',
  priority: 'normal',
  depends_on: [],
  blocks: [],
  links: [],
  dedupe_key: 'key-1',
  actor: { type: 'user', id: 'owner' },
  ...over,
});

const edges = (rig: Rig) =>
  rig.storage.transaction((tx) => tx.cardRelations.listByProject('forge'));

const create = async (rig: Rig, key: string, over: Partial<CreateCardInput> = {}) => {
  const out = await rig.engine.createCard(input({ dedupe_key: key, ...over }));
  if (out.status !== 'created') {
    throw new Error(`not created: ${out.status}`);
  }

  return out.card.id as CardId;
};

describe('setCardRelations', () => {
  const owner = { type: 'user', id: 'owner' } as const;

  it('replaces the card edges in both directions and notes the change', async () => {
    const rig = await makeRig();
    const a = await create(rig, 'a');
    const b = await create(rig, 'b');
    const c = await create(rig, 'c', { depends_on: [a] });

    const out = await rig.engine.setCardRelations(c, {
      depends_on: [b],
      blocks: [a],
      actor: owner,
    });

    expect(out).toMatchObject({ status: 'updated', card: { id: c } });
    expect(await edges(rig)).toEqual([
      { from: c, to: b, kind: 'depends_on' },
      { from: a, to: c, kind: 'depends_on' },
    ]);

    const events = await rig.storage.transaction((tx) =>
      tx.cardEvents.list(c, { limit: 10 }),
    );

    expect(events.at(-1)).toMatchObject({
      kind: 'note',
      actor: owner,
      payload: { text: expect.stringContaining('Depends on: FG-C2') },
    });
  });

  it('clears every edge when both lists are empty', async () => {
    const rig = await makeRig();
    const a = await create(rig, 'a');
    const b = await create(rig, 'b', { depends_on: [a] });

    await rig.engine.setCardRelations(b, { depends_on: [], blocks: [], actor: owner });

    expect(await edges(rig)).toEqual([]);
  });

  it('lets a card keep an edge it already has when the new set still includes it', async () => {
    const rig = await makeRig();
    const a = await create(rig, 'a');
    const b = await create(rig, 'b', { depends_on: [a] });

    const out = await rig.engine.setCardRelations(b, {
      depends_on: [a],
      blocks: [],
      actor: owner,
    });

    expect(out.status).toBe('updated');
    expect(await edges(rig)).toEqual([{ from: b, to: a, kind: 'depends_on' }]);
  });

  it('refuses a loop through the other cards and keeps the old edges', async () => {
    const rig = await makeRig();
    const a = await create(rig, 'a');
    const b = await create(rig, 'b', { depends_on: [a] });
    const c = await create(rig, 'c', { depends_on: [b] });
    const before = await edges(rig);

    // A would wait on C while B still waits on A and C on B.
    const out = await rig.engine.setCardRelations(a, {
      depends_on: [c],
      blocks: [b],
      actor: owner,
    });

    expect(out).toEqual({ status: 'dependency_cycle', cycle: [a, c, b, a] });
    expect(await edges(rig)).toEqual(before);
  });

  it('treats the set as complete: a blocker left out of `blocks` stops depending on the card', async () => {
    const rig = await makeRig();
    const a = await create(rig, 'a');
    const b = await create(rig, 'b', { depends_on: [a] });

    const out = await rig.engine.setCardRelations(a, {
      depends_on: [b],
      blocks: [],
      actor: owner,
    });

    expect(out.status).toBe('updated');
    expect(await edges(rig)).toEqual([{ from: a, to: b, kind: 'depends_on' }]);
  });

  it('refuses itself, an unknown card, another project and an unknown target', async () => {
    const rig = await makeRig();
    await rig.seedProject({ id: 'api', slug: 'api', prefix: 'AP' });
    const a = await create(rig, 'a');
    const other = await create(rig, 'o', { project: 'api' });

    expect(
      (
        await rig.engine.setCardRelations(a, {
          depends_on: [a],
          blocks: [],
          actor: owner,
        })
      ).status,
    ).toBe('dependency_cycle');

    expect(
      await rig.engine.setCardRelations(a, {
        depends_on: [other],
        blocks: [],
        actor: owner,
      }),
    ).toEqual({
      status: 'cross_project_dependency',
      id: other,
    });

    expect(
      await rig.engine.setCardRelations(a, {
        depends_on: ['FG-C99'],
        blocks: [],
        actor: owner,
      }),
    ).toEqual({
      status: 'card_not_found',
      id: 'FG-C99',
    });

    expect(
      await rig.engine.setCardRelations('FG-C99', {
        depends_on: [],
        blocks: [],
        actor: owner,
      }),
    ).toEqual({
      status: 'card_not_found',
      id: 'FG-C99',
    });

    expect(
      await rig.engine.setCardRelations('nope', {
        depends_on: [],
        blocks: [],
        actor: owner,
      }),
    ).toEqual({
      status: 'card_not_found',
      id: 'nope',
    });
  });
});
