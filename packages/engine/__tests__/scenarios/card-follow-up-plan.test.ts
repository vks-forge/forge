/**
 * Scenario: the owner asks for more work on a finished card and the Director re-plans.
 *
 * Why: a card that is Done can still get more work. When the Director chooses to re-plan instead
 *   of filing one ticket, the card must go back to grilling and take the new plan through
 *   approval like any plan. The tickets that already finished must not stand in the way: the new
 *   plan's tickets start the card again, and the card completes only when the whole live ticket
 *   set is done.
 *
 * Pins: re-plan from a done card moves it to grilling; the new plan gets version 2 and is approved,
 *   filing its tickets; the card runs again with them; it completes only when all live tickets are done.
 * Depends on: helpers/escalation-rig, helpers/planning-rig, src/tick/card-phase, vitest.
 */

import type { Ticket } from '@forge/core';
import { describe, expect, it, vi } from 'vitest';
import { syncCardWithTickets } from '#/tick/card-phase.js';
import { pendingOf } from '#tests/helpers/escalation-rig.js';
import {
  cardOf,
  eventsOf,
  planUntilDecision,
  planningRig,
  scriptTodo,
  tickets,
  todoPlan,
} from '#tests/helpers/planning-rig.js';

// Every lane runs now, so a held lane has to be stubbed to exercise the hold path still kept for a lane without a runner.
vi.mock('#/domain/live-lanes.js', () => ({
  LIVE_LANES: ['express', 'standard'],
  isLive: (lane: string) => lane !== 'full',
}));

const NOW = '2026-10-16T00:00:00.000Z';

const ticketPlan = (key: string, lane: string, files: string[]) => ({
  key,
  title: `Ticket ${key}`,
  body: `Do ${key}.`,
  acceptance: [`${key} works`],
  priority: 'normal',
  depends_on: [],
  lane,
  size: 'S',
  files,
});

describe('follow-up plan on a done card', () => {
  it('re-plans from done, approves v2, and the card follows the whole ticket set', async () => {
    const rig = await planningRig();
    const v1 = todoPlan({
      tickets: [
        ticketPlan('t1', 'full', ['src/a.ts']),
        ticketPlan('t2', 'express', ['src/b.ts']),
      ],
    });

    // v2 plans t1 again (its file), so approving it cancels nothing the plan leaves uncovered and the Director may approve.
    const v2 = todoPlan({
      tickets: [
        ticketPlan('t1', 'express', ['src/a.ts']),
        ticketPlan('t3', 'express', ['src/c.ts']),
      ],
    });

    scriptTodo(rig, { write_plan: [v1, v2] });
    const card = await planUntilDecision(rig);
    await rig.tick();
    const [t1, t2] = await tickets(rig, card);
    const [hold] = await pendingOf(rig, t1!.id, 'failure');

    // Legacy shape: the card was marked done although t1 waits and t2 is finished.
    await rig.storage.transaction(async (tx) => {
      const t = (await tx.tickets.get(t2!.id)) as Ticket;
      await tx.tickets.updateTicketCas(t.id, t.status_version, { status: 'done' });
      const c = (await tx.cards.get(card))!;
      await tx.cards.updatePhase(card, c.phase_version, {
        phase: 'done',
        needs_you: false,
        updated_at: NOW,
      });
    });

    const out = await rig.engine.actOnEscalation(
      hold!.id,
      { action: 'replan', comment: 'Also add t3' },
      'owner',
    );

    expect(out.status).toBe('done');
    expect((await cardOf(rig, card)).phase).toBe('grilling');

    // The Director approves v2 behind the floor; the card runs again with the new ticket.
    await rig.tick();
    expect((await cardOf(rig, card)).phase).toBe('in_progress');
    const approved = await eventsOf(rig, card, 'plan_approved');
    expect(approved.map((e) => e.payload.version)).toEqual([1, 2]);
    const live = (await tickets(rig, card)).filter((t) => t.status !== 'cancelled');
    expect(live.some((t) => t.title === 'Ticket t3')).toBe(true);

    // Everything live finishes: the card completes on the whole set, not on the new tickets alone.
    await rig.storage.transaction(async (tx) => {
      for (const t of await tx.tickets.listByCard(card)) {
        if (t.status !== 'cancelled') {
          await tx.tickets.updateTicketCas(t.id, t.status_version, { status: 'done' });
        }
      }

      await syncCardWithTickets(tx, card, NOW);
    });

    expect((await cardOf(rig, card)).phase).toBe('done');
  });
});
