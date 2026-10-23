/**
 * Scenario: several cards think at once, within the Director's step limit, one turn per card.
 *
 * Why: with cards answered one after another, the fourth card waited for the first three, and a
 *   claim that marked every owed row claimed stranded the rows of cards with no free slot for ten
 *   minutes. After a restart, rows claimed by the dead process waited out the same ten minutes.
 *   The Director's limit (`max_concurrent_steps`) and the per-card key are what keep many cards
 *   fast without ever running two turns of one card or answering a message twice.
 *
 * Pins: four owed cards with the default limit of 3 start 3 turns, the 4th starts when one ends;
 *   the limit is a setting (1 runs one at a time); a card never has two turns in flight, and a
 *   message written mid-turn is claimed after the turn; rows of a card without a free slot stay
 *   unclaimed; claims held at boot are released on the first tick and answered at once; owner
 *   messages are served before older rows without one.
 * Depends on: helpers/hang-step, helpers/card-chat, helpers/rig, @forge/core, vitest.
 */

import type { CardId } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { hangStep } from '#tests/helpers/hang-step.js';
import { makeRig } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';

const card = (n: number) => `FG-C${n}` as CardId;

async function discussions(rig: Rig, count: number): Promise<void> {
  for (let n = 1; n <= count; n++) {
    const out = await rig.engine.createCard({
      project: 'forge',
      title: `Question ${n}`,
      description: `Should we do thing ${n}?`,
      type: 'discussion',
      priority: 'normal',
      depends_on: [],
      blocks: [],
      links: [],
      dedupe_key: `k-${n}`,
      actor: { type: 'user', id: 'owner' },
    });

    if (out.status !== 'created') {
      throw new Error(`card not created: ${out.status}`);
    }
  }
}

const open = (rig: Rig, n: number) =>
  rig.storage.transaction((tx) => tx.cardReplyQueue.listOpen(card(n)));

const setLimit = async (rig: Rig, limit: number) =>
  void (await rig.config.append({
    scope: 'company',
    doc: { director: { max_concurrent_steps: limit } },
    author: 'test',
    reason: 'limit',
    expectedVersion: (await rig.config.company()).version,
  }));

describe('Director step concurrency', () => {
  it('runs three turns of four owed cards, and starts the fourth when one ends', async () => {
    const rig = await makeRig();
    const hang = hangStep(rig, 'card_chat');
    await discussions(rig, 4);

    await rig.engine.tick();

    expect(hang.started).toBe(3);
    expect(rig.engine.directorJobsInFlight()).toBe(3);

    hang.release();
    await rig.flush();
    await rig.engine.tick();

    expect(hang.started).toBe(4);
    hang.releaseAll();
    await rig.engine.idle();
    await rig.engine.tick();
    await rig.engine.idle();

    expect(rig.llm.callsTo('card_chat')).toHaveLength(4);
    for (let n = 1; n <= 4; n++) {
      expect(await open(rig, n)).toEqual([]);
    }
  });

  it('takes the limit from the Director settings', async () => {
    const rig = await makeRig();
    await setLimit(rig, 1);
    const hang = hangStep(rig, 'card_chat');
    await discussions(rig, 2);

    await rig.engine.tick();

    expect(hang.started).toBe(1);
    hang.releaseAll();
    await rig.engine.idle();
  });

  it('never runs two turns for one card; a message written mid-turn is claimed after the turn', async () => {
    const rig = await makeRig();
    const hang = hangStep(rig, 'card_chat');
    await discussions(rig, 1);
    await rig.engine.tick();
    expect(hang.started).toBe(1);

    await rig.engine.postCardMessage('FG-C1', 'one more thing', 'vikash');
    await rig.engine.tick();

    expect(hang.started).toBe(1);
    const waiting = await open(rig, 1);
    expect(waiting.map((r) => [r.reason, r.claimed_at])).toEqual([
      ['card_created', expect.any(String)],
      ['user_message', undefined],
    ]);

    hang.release(0);
    await rig.flush();
    await rig.engine.tick();

    expect(hang.started).toBe(2);
    hang.releaseAll();
    await rig.engine.idle();
    await rig.engine.tick();
    await rig.engine.idle();

    expect(await open(rig, 1)).toEqual([]);
    expect(rig.llm.callsTo('card_chat')).toHaveLength(2);
  });

  it('leaves the rows of a card with no free slot unclaimed', async () => {
    const rig = await makeRig();
    await setLimit(rig, 1);
    const hang = hangStep(rig, 'card_chat');
    await discussions(rig, 2);

    await rig.engine.tick();

    expect((await open(rig, 1))[0]?.claimed_at).toEqual(expect.any(String));
    expect((await open(rig, 2))[0]?.claimed_at).toBeUndefined();
    hang.releaseAll();
    await rig.engine.idle();
  });

  it('serves a card with an owner message before older cards without one when slots are short', async () => {
    const rig = await makeRig();
    await setLimit(rig, 1);
    await discussions(rig, 2);
    await rig.engine.postCardMessage('FG-C2', 'please answer me first', 'vikash');
    const hang = hangStep(rig, 'card_chat');

    await rig.engine.tick();

    expect((await open(rig, 1))[0]?.claimed_at).toBeUndefined();
    expect((await open(rig, 2)).every((r) => r.claimed_at !== undefined)).toBe(true);
    hang.releaseAll();
    await rig.engine.idle();
  });
});

describe('claims after a restart', () => {
  it('answers a row claimed by the dead process on the first tick, not ten minutes later', async () => {
    const rig = await makeRig();
    await discussions(rig, 1);
    const claimedAt = new Date(rig.clock.now() - 1_000).toISOString();
    await rig.storage.transaction((tx) => tx.cardReplyQueue.claim(claimedAt, claimedAt));
    expect(await open(rig, 1)).toHaveLength(1);

    const restarted = rig.restart('srv-b');
    await rig.tickOn(restarted);

    expect(await open(rig, 1)).toEqual([]);
    expect(rig.llm.callsTo('card_chat')).toHaveLength(1);
  });

  it('releases claims on the first tick only: a later live claim is left alone', async () => {
    const rig = await makeRig();
    await rig.tick();
    await discussions(rig, 1);
    const claimedAt = new Date(rig.clock.now() - 1_000).toISOString();
    await rig.storage.transaction((tx) => tx.cardReplyQueue.claim(claimedAt, claimedAt));

    await rig.tick();

    expect(rig.llm.callsTo('card_chat')).toHaveLength(0);
    expect(await open(rig, 1)).toHaveLength(1);
  });
});
