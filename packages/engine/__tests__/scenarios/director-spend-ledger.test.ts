/**
 * Scenario: every dollar the Director spends goes through one door into the dated spend ledger.
 *
 * Why: Cost, Overview and the card all add the Director's own steps to the Workers' runs, so each step
 *   must leave a dated row (project, card, ticket, kind, model, dollars), not just bump a running total;
 *   a step that fails after its harness reported a price still cost that money; a step on a ticket with no
 *   card is real spend with no card to show it on; and the budget heads-up must fire from a chat turn with
 *   no cap on the card, the case that used to warn about nothing. The card keeps a cached total of its own
 *   rows in the same transaction, the one number its budget check reads.
 *
 * Pins: a chat turn writes one row with its model and cost and the card total matches the row sum; a failed
 *   chat step with a reported cost still lands in the ledger; a card with no cap warns at 80 percent of the
 *   Forge default from a chat turn; a planning step writes its rows through the ledger (rows sum to the cached
 *   total); a ticket-only step records with no card and adds to no card total; an unpriced step is a row with
 *   no dollars; a step tied to neither card nor ticket is skipped.
 * Depends on: helpers/card-chat, helpers/planning-rig, helpers/rig, helpers/scripted-llm, src/tick/card-budget.
 */

import type { CardId, Ticket } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { C1, card, discussion, history, say } from '#tests/helpers/card-chat.js';
import { createPlanCard, planningRig } from '#tests/helpers/planning-rig.js';
import { makeRig } from '#tests/helpers/rig.js';
import type { Rig } from '#tests/helpers/rig.js';
import { fail } from '#tests/helpers/scripted-llm.js';
import { addDirectorSpend } from '#/tick/card-budget.js';

const AT = '2026-10-20T10:00:00.000Z';

const ledger = async (rig: Rig, cardId: CardId = C1) => {
  const project = (await card(rig, cardId))?.project ?? 'forge';

  return rig.storage.transaction((tx) => tx.directorSpend.listByProject(project));
};

const cachedTotal = (rig: Rig, cardId: CardId = C1) =>
  rig.storage.transaction(
    async (tx) => (await tx.cardPlanning.get(cardId)).grill.director_spend_usd,
  );

describe('Director spend ledger: chat', () => {
  it('writes one dated row per chat turn and keeps the card total equal to the row sum', async () => {
    const rig = await makeRig();
    await discussion(rig);
    rig.llm.cost('card_chat', 0.12);
    rig.llm.script('card_chat', { reply: 'Yes.', actions: [] });

    await say(rig, 'what do you think?');
    await rig.tick();

    const rows = await ledger(rig);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      card_id: C1,
      kind: 'card_chat',
      model: expect.any(String),
      usd: 0.12,
      recorded: true,
    });

    expect(await cachedTotal(rig)).toBeCloseTo(rows.reduce((s, r) => s + r.usd, 0));
  });

  it('records the cost of a chat step that failed after its harness reported a price', async () => {
    const rig = await makeRig();
    await discussion(rig);
    rig.llm.cost('card_chat', 0.3);
    rig.llm.script('card_chat', fail({ kind: 'crash', message: 'boom' }));

    await say(rig, 'what do you think?');
    await rig.tick();

    const rows = await ledger(rig);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'card_chat', usd: 0.3, recorded: true });
    expect(await cachedTotal(rig)).toBeCloseTo(0.3);
  });

  it('records a priceless chat turn as a step with no dollars, never a guessed amount', async () => {
    const rig = await makeRig();
    await discussion(rig);
    rig.llm.script('card_chat', { reply: 'Yes.', actions: [] });

    await say(rig, 'what do you think?');
    await rig.tick();

    const rows = await ledger(rig);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ usd: 0, recorded: false });
    expect(await cachedTotal(rig)).toBe(0);
  });

  it('warns at 80 percent of the Forge default from a chat turn on a card with no cap', async () => {
    const rig = await makeRig();
    await rig.config.append({
      scope: 'company',
      doc: { director: { budget_warning_usd: 1 } },
      author: 'test',
      reason: 'budget',
      expectedVersion: 0,
    });

    await discussion(rig);
    rig.llm.cost('card_chat', 0.85);
    rig.llm.script('card_chat', { reply: 'Yes.', actions: [] });

    await say(rig, 'what do you think?');
    await rig.tick();

    const warnings = (await history(rig)).filter((e) => e.kind === 'budget_warning');
    expect(warnings.map((w) => w.payload)).toEqual([
      { threshold: 0.8, spent_usd: 0.85, cap_usd: 1 },
    ]);
  });
});

describe('Director spend ledger: planning', () => {
  it('writes planning step cost through the ledger so the rows sum to the card total', async () => {
    const rig = await planningRig();
    rig.llm.cost('grill_turn', 0.04);
    const id = await createPlanCard(rig);
    await rig.tick();

    const rows = (await ledger(rig, id)).filter((r) => r.card_id === id);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.kind !== 'backfill' && r.recorded)).toBe(true);
    expect(rows.reduce((s, r) => s + r.usd, 0)).toBeCloseTo(await cachedTotal(rig, id));
    expect(await cachedTotal(rig, id)).toBeGreaterThanOrEqual(0.04);
  });
});

describe('addDirectorSpend', () => {
  const seed = async () => {
    const rig = await makeRig();
    await rig.request('Fix it');
    const cardRow = await card(rig);
    const ticket = await rig.ticket('FG-1');
    await rig.storage.transaction((tx) =>
      tx.tickets.insert({ ...ticket, id: 'FG-9' as Ticket['id'], card_id: undefined }),
    );

    return { rig, project: cardRow?.project ?? 'forge' };
  };

  it('records a ticket-only step with no card and leaves every card total alone', async () => {
    const { rig, project } = await seed();

    await rig.storage.transaction((tx) =>
      addDirectorSpend(tx, undefined, 0.5, AT, 5, {
        kind: 'escalation_answer',
        ticketId: 'FG-9',
      }),
    );

    const rows = await rig.storage.transaction((tx) =>
      tx.directorSpend.listByProject(project),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ticket_id: 'FG-9', usd: 0.5 });
    expect(rows[0]).not.toHaveProperty('card_id');
    expect(await cachedTotal(rig)).toBe(0);
  });

  it('skips a step tied to neither a card nor a ticket and a zero-dollar priced step', async () => {
    const { rig, project } = await seed();

    await rig.storage.transaction(async (tx) => {
      await addDirectorSpend(tx, undefined, 1, AT, 5, { kind: 'x' });
      await addDirectorSpend(tx, C1, 0, AT, 5, { kind: 'x' });
    });

    expect(
      await rig.storage.transaction((tx) => tx.directorSpend.listByProject(project)),
    ).toEqual([]);
  });
});
