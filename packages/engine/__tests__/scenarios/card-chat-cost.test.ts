/**
 * Scenario: the Director's card chat turns count toward the card's Director spend.
 *
 * Why: the card page shows what the card cost, Director included. Planning and escalation
 *   steps already add their dollars to the card's planning spend (d-0143); a chat turn that
 *   did not would leave the owner's most frequent Director call invisible in the total and
 *   out of the budget warning.
 *
 * Pins: a successful `card_chat` step adds its reported cost to `director_spend_usd`; a turn
 *   that reports no cost adds nothing; two turns add up.
 * Depends on: helpers/card-chat, helpers/rig, helpers/scripted-llm, vitest.
 */

import { describe, expect, it } from 'vitest';
import { C1, discussion, say } from '#tests/helpers/card-chat.js';
import { makeRig } from '#tests/helpers/rig.js';

describe('card chat spend', () => {
  const spend = (rig: Awaited<ReturnType<typeof makeRig>>) =>
    rig.storage.transaction(
      async (tx) => (await tx.cardPlanning.get(C1)).grill.director_spend_usd,
    );

  it('adds a reported chat cost to the card Director spend', async () => {
    const rig = await makeRig();
    await discussion(rig);
    rig.llm.cost('card_chat', 0.12);
    rig.llm.script('card_chat', { reply: 'Yes.', actions: [] });

    await say(rig, 'what do you think?');
    await rig.tick();

    expect(await spend(rig)).toBeCloseTo(0.12);
  });

  it('adds nothing when the turn reports no cost', async () => {
    const rig = await makeRig();
    await discussion(rig);
    rig.llm.script('card_chat', { reply: 'Yes.', actions: [] });

    await say(rig, 'what do you think?');
    await rig.tick();

    expect(await spend(rig)).toBe(0);
  });

  it('sums consecutive turns', async () => {
    const rig = await makeRig();
    await discussion(rig);
    rig.llm.cost('card_chat', 0.1);
    rig.llm.script('card_chat', { reply: 'One.', actions: [] });
    await say(rig, 'first');
    await rig.tick();
    rig.llm.script('card_chat', { reply: 'Two.', actions: [] });
    await say(rig, 'second');
    await rig.tick();

    expect(await spend(rig)).toBeCloseTo(0.2);
  });
});
