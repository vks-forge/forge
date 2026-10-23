/**
 * Scenario: Re-plan from a stopped ticket tells the Director why the ticket stopped.
 *
 * Why: the owner presses Re-plan with a vague comment ("fix the issues"). Without the stop itself
 *   (kind, cause, summary, findings) the Director guesses what is wrong and re-plans unrelated
 *   drift while the ticket stays parked (CHE-6). The stop rides on `replan_requested` and in the
 *   planning input as `replan_from`.
 *
 * Pins: `replan_requested.payload.stop` and `replan_from` in the grill step input, with the comment.
 * Depends on: helpers/escalation-rig, helpers/planning-rig, vitest.
 */

import { describe, expect, it, vi } from 'vitest';
import { cardEventsOf, pendingOf } from '#tests/helpers/escalation-rig.js';
import {
  pick,
  planUntilDecision,
  planningRig,
  scriptTodo,
  tickets,
  todoPlan,
} from '#tests/helpers/planning-rig.js';

vi.mock('#/domain/live-lanes.js', () => ({
  LIVE_LANES: ['express', 'standard'],
  isLive: (lane: string) => lane !== 'full',
}));

describe('Re-plan from a stop', () => {
  it('tells the Director why the ticket stopped, not only the comment (replan_from)', async () => {
    const rig = await planningRig();
    const plan = todoPlan({
      tickets: [
        {
          key: 't1',
          title: 'Ticket t1',
          body: 'Do t1.',
          acceptance: ['t1 works'],
          priority: 'high',
          depends_on: [],
          lane: 'full',
          size: 'S',
          files: ['src/a.ts'],
        },
      ],
    });

    scriptTodo(rig, { write_plan: [plan, plan] });
    const card = await planUntilDecision(rig);
    await rig.tick();
    const t1 = (await tickets(rig, card))[0]!;
    const [hold] = await pendingOf(rig, t1.id, 'failure');
    if (!hold) {
      throw new Error('no hold');
    }

    const payload = hold.payload as { summary?: string };
    await rig.engine.actOnEscalation(
      hold.id,
      { action: 'replan', comment: 'fix the issues' },
      'owner',
    );

    const requested = await cardEventsOf(rig, card, 'replan_requested');
    expect(requested[0]!.payload).toMatchObject({
      stop: { escalation: { kind: 'failure', summary: payload.summary } },
    });

    await rig.tick();
    const input = rig.llm.callsTo('grill_turn').at(-1)!.input;
    expect(pick(input, 'replan_from')).toMatchObject({
      ticket_id: t1.id,
      plan_key: 't1',
      stop: { escalation: { kind: 'failure', summary: payload.summary } },
    });

    expect(pick(input, 'changes_requested')).toMatchObject({ comment: 'fix the issues' });
  });
});
