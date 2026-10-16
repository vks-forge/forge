/**
 * Scenario: the card phase and budget shape what the Director may file.
 *
 * Why: tickets come from an approved plan, so while a card is being grilled, verified or has a
 *   plan awaiting approval the Director must not file any (d-0141), even on a card type that
 *   starts tickets; once approved it may. The budget is only a warning (d-0143): crossing a
 *   share of the cap writes one `budget_warning` per threshold and never refuses work, or a
 *   cost guard would become the dead end the flow is built to avoid.
 *
 * Pins: create_ticket refused in grilling, verifying and plan_ready; allowed once approved
 *   (and the card starts); a budget warning per threshold, once, with the ticket still filed.
 * Depends on: helpers/card-chat, helpers/rig, helpers/scripted-llm, @forge/core, vitest.
 */

import { describe, expect, it } from 'vitest';
import { C1, card, discussion, history, say } from '#tests/helpers/card-chat.js';
import { makeRig } from '#tests/helpers/rig.js';

describe('card chat actions by phase and budget', () => {
  it.each(['grilling', 'verifying', 'plan_ready'] as const)(
    'refuses create_ticket while the card is %s, even on a type that allows tickets',
    async (phase) => {
      const rig = await makeRig();
      await rig.request('Fix it');
      await rig.storage.transaction((tx) =>
        tx.cards.updatePhase(C1, 0, {
          phase,
          needs_you: false,
          updated_at: '2026-10-16T00:00:00.000Z',
        }),
      );

      rig.llm.script('card_chat', {
        reply: 'Filing.',
        actions: [{ kind: 'create_ticket', title: 'More', body: 'More work' }],
      });

      await say(rig);
      await rig.tick();

      expect(
        await rig.storage.transaction((tx) => tx.tickets.listByCard(C1)),
      ).toHaveLength(1);
    },
  );

  it('files a ticket once the plan is approved', async () => {
    const rig = await makeRig();
    await discussion(rig);
    await rig.storage.transaction(async (tx) => {
      await tx.cards.update(C1, { type: 'plan', updated_at: '2026-10-16T00:00:00.000Z' });
      await tx.cards.updatePhase(C1, 0, {
        phase: 'approved',
        needs_you: false,
        updated_at: '2026-10-16T00:00:00.000Z',
      });
    });

    rig.llm.script('card_chat', {
      reply: 'Filing.',
      actions: [{ kind: 'create_ticket', title: 'Step one', body: 'Do step one.' }],
    });

    await say(rig);
    await rig.tick();

    const tickets = await rig.storage.transaction((tx) => tx.tickets.listByCard(C1));
    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({ card_id: 'FG-C1', body: 'Do step one.' });
    expect((await card(rig))?.phase).toBe('in_progress');
  });

  it('warns once per threshold when spend reaches the cap, and never refuses a ticket', async () => {
    const rig = await makeRig();
    await rig.request('Fix it');
    await rig.storage.transaction(async (tx) => {
      await tx.cards.update(C1, {
        budget_cap_usd: 1,
        updated_at: '2026-10-16T00:00:00.000Z',
      });

      await tx.runs.insert({
        id: 'run-spent',
        ticket_id: 'FG-1',
        harness: 'scripted',
        driver_version: '1',
        cwd: '/tmp/x',
        lane: 'express',
        started_at: '2026-10-16T00:00:00.000Z',
        status: 'success',
        owner: 'srv',
        cost_usd: 1.2,
      });
    });

    rig.llm.script('card_chat', {
      reply: 'Filing.',
      actions: [{ kind: 'create_ticket', title: 'More', body: 'More work' }],
    });

    await say(rig);
    await rig.tick();
    await say(rig, 'and again');
    rig.llm.script('card_chat', { reply: 'Ok.', actions: [] });
    await rig.tick();

    const tickets = await rig.storage.transaction((tx) => tx.tickets.listByCard(C1));
    const warnings = (await history(rig)).filter((e) => e.kind === 'budget_warning');

    expect(tickets).toHaveLength(2);
    expect(warnings.map((w) => w.payload)).toEqual([
      { threshold: 0.8, spent_usd: 1.2, cap_usd: 1 },
      { threshold: 1, spent_usd: 1.2, cap_usd: 1 },
    ]);

    expect((await history(rig)).some((e) => e.kind === 'note')).toBe(false);
  });
});
