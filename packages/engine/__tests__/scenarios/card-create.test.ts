/**
 * Scenario: creating a card, the engine one door for new cards.
 *
 * Why: under the card-first flow a request is a card the Director plans before any ticket
 *   exists (d-0128). The create-card form must store the card in `grilling` with no ticket,
 *   the owner's words as the first event and a queued Director reply, and refuse what would
 *   strand work: a dependency that is not a card, belongs to another project or closes a
 *   loop (d-0141). A double click must not make two cards.
 *
 * Pins: created card fields, no ticket, first event text, queued reply and a tick request; a
 *   repeated dedupe_key returns the first card; unknown and archived projects, unknown card
 *   type and a type that refuses chat; unknown, cross-project and cyclic dependencies make
 *   nothing; `blocks` is the reverse edge. Editing the edges later is pinned in card-relations.
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
  priority: 'high',
  depends_on: [],
  blocks: [],
  links: ['https://example.com/spec'],
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

  return out.card.id;
};

describe('createCard', () => {
  it('stores a card in grilling with no ticket, the first event and a queued reply', async () => {
    const rig = await makeRig();

    const out = await rig.engine.createCard(input());

    expect(out).toMatchObject({
      status: 'created',
      card: {
        id: 'FG-C1',
        project: 'forge',
        type: 'plan',
        title: 'A todo application',
        summary: 'Build a small todo application with a list and a form.',
        source: { kind: 'chat', ref: 'key-1' },
        created_by: { type: 'user', id: 'owner' },
        phase: 'grilling',
        phase_version: 0,
        needs_you: false,
        priority: 'high',
        links: ['https://example.com/spec'],
      },
    });

    const id = 'FG-C1' as CardId;
    const events = await rig.storage.transaction((t) =>
      t.cardEvents.list(id, { limit: 10 }),
    );

    expect(events).toMatchObject([
      {
        kind: 'user_message',
        payload: {
          text: 'A todo application\n\nBuild a small todo application with a list and a form.',
        },
      },
    ]);

    expect(await rig.storage.transaction((t) => t.tickets.listByCard(id))).toEqual([]);
    expect(
      await rig.storage.transaction((t) => t.cardReplyQueue.listOpen(id)),
    ).toMatchObject([{ event_id: 0, reason: 'card_created' }]);

    expect(rig.tickRequests.count).toBe(1);
  });

  it('returns the first card for a repeated dedupe_key and makes no second card or reply', async () => {
    const rig = await makeRig();

    const first = await rig.engine.createCard(input());
    const again = await rig.engine.createCard(input({ title: 'A different title here' }));

    expect(first.status).toBe('created');
    expect(again).toMatchObject({
      status: 'duplicate',
      card: { id: 'FG-C1', title: 'A todo application' },
    });

    const cards = await rig.storage.transaction((tx) =>
      tx.cards.listByProject('forge', { limit: 10 }),
    );

    const queue = await rig.storage.transaction((tx) =>
      tx.cardReplyQueue.listOpen('FG-C1' as CardId),
    );

    expect(cards).toHaveLength(1);
    expect(queue).toHaveLength(1);
  });

  it('numbers cards per project and keeps a dedupe_key per project', async () => {
    const rig = await makeRig();
    await rig.seedProject({ id: 'api', slug: 'api', prefix: 'AP' });

    const a = await rig.engine.createCard(input());
    const b = await rig.engine.createCard(input({ project: 'api' }));

    expect(a).toMatchObject({ status: 'created', card: { id: 'FG-C1' } });
    expect(b).toMatchObject({ status: 'created', card: { id: 'AP-C1' } });
  });

  it('refuses an unknown project, an archived project, an unknown type and a type that refuses chat', async () => {
    const rig = await makeRig();

    expect(await rig.engine.createCard(input({ project: 'nope' }))).toEqual({
      status: 'project_not_found',
    });

    expect(await rig.engine.createCard(input({ type: 'epic' }))).toEqual({
      status: 'invalid_type',
      reason: 'unknown card type epic',
    });

    expect(await rig.engine.createCard(input({ type: 'pr_issue' }))).toMatchObject({
      status: 'created',
    });

    await rig.seedProject({ id: 'old', slug: 'old', prefix: 'OLD', status: 'archived' });
    expect(await rig.engine.createCard(input({ project: 'old' }))).toEqual({
      status: 'project_archived',
    });
  });

  it('records depends_on as edges from the new card and blocks as edges into it', async () => {
    const rig = await makeRig();
    const a = await create(rig, 'a');
    const b = await create(rig, 'b');

    const c = await create(rig, 'c', { depends_on: [a], blocks: [b] });

    expect(await edges(rig)).toEqual([
      { from: c, to: a, kind: 'depends_on' },
      { from: b, to: c, kind: 'depends_on' },
    ]);
  });

  it('refuses a dependency that is not a card, with nothing stored', async () => {
    const rig = await makeRig();

    expect(await rig.engine.createCard(input({ depends_on: ['FG-C99'] }))).toEqual({
      status: 'card_not_found',
      id: 'FG-C99',
    });

    expect(await rig.engine.createCard(input({ blocks: ['not-an-id'] }))).toEqual({
      status: 'card_not_found',
      id: 'not-an-id',
    });

    expect(
      await rig.storage.transaction((tx) =>
        tx.cards.listByProject('forge', { limit: 10 }),
      ),
    ).toEqual([]);
  });

  it('refuses a dependency on a card of another project', async () => {
    const rig = await makeRig();
    await rig.seedProject({ id: 'api', slug: 'api', prefix: 'AP' });
    const other = await create(rig, 'o', { project: 'api' });

    expect(await rig.engine.createCard(input({ depends_on: [other] }))).toEqual({
      status: 'cross_project_dependency',
      id: other,
    });

    expect(await rig.engine.createCard(input({ blocks: [other] }))).toEqual({
      status: 'cross_project_dependency',
      id: other,
    });
  });

  it('refuses a loop through the new card and names it', async () => {
    const rig = await makeRig();
    const a = await create(rig, 'a');
    const b = await create(rig, 'b', { depends_on: [a] });

    // New card N depends on B and blocks A: A waits on N, N on B, B on A.
    const out = await rig.engine.createCard(
      input({ dedupe_key: 'n', depends_on: [b], blocks: [a] }),
    );

    expect(out).toEqual({
      status: 'dependency_cycle',
      cycle: ['FG-C3', 'FG-C2', 'FG-C1', 'FG-C3'],
    });

    expect(
      await rig.storage.transaction((tx) =>
        tx.cards.listByProject('forge', { limit: 10 }),
      ),
    ).toHaveLength(2);
  });

  it('refuses a card that depends on and blocks the same card', async () => {
    const rig = await makeRig();
    const a = await create(rig, 'a');

    const out = await rig.engine.createCard(
      input({ dedupe_key: 'n', depends_on: [a], blocks: [a] }),
    );

    expect(out).toMatchObject({ status: 'dependency_cycle' });
  });
});
