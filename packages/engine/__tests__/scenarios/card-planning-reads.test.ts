/**
 * Scenario: the Director's reads through the door, spend, and plan reads.
 *
 * Why: the Director's reading of the code must stay inside the door: denied paths are refused and
 *   recorded, caps hold, two read rounds at most (d-0131), and spend counts on the card with one
 *   warning per level, never a block (d-0143). The plan reads the Plan tab depends on must return
 *   every version, the current plan and the floor as it stands now.
 *
 * Pins: a path outside the project and an untracked file refused with the step told; the file cap;
 *   the read-round limit; budget warnings once per level with the flow still finishing; plan reads
 *   and their not-found outcomes.
 * Depends on: helpers/planning-rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  answerWith,
  cardOf,
  createPlanCard,
  eventsOf,
  planningRig,
  readOks,
  scriptTodo,
} from '#tests/helpers/planning-rig.js';

describe('reads through the door', () => {
  it('refuses a path outside the project and an untracked file, and tells the step', async () => {
    const rig = await planningRig();
    scriptTodo(rig, {
      card_survey: [
        {
          read_requests: [
            { op: 'read', path: '../secrets.txt' },
            { op: 'read', path: 'missing.ts' },
            { op: 'read', path: 'package.json' },
          ],
        },
        { findings: { summary: 'ok', predicted_lane: 'standard' } },
      ],
    });

    const id = await createPlanCard(rig);
    await rig.tick();

    expect(readOks(rig.llm.callsTo('card_survey')[1]?.input)).toEqual([
      false,
      false,
      true,
    ]);

    expect(rig.repo.calls.filter((c) => c.startsWith('read '))).not.toContain(
      'read ../secrets.txt',
    );

    const finished = (await eventsOf(rig, id, 'step_finished'))[0]?.payload;
    expect(finished?.files_read.map((f) => f.path)).toEqual(['package.json']);
  });

  it('stops reading at the file cap and the byte cap', async () => {
    const rig = await planningRig();
    await rig.config.append({
      scope: 'company',
      doc: { director: { read_caps: { max_files: 1, max_bytes: 400_000 } } },
      author: 'test',
      reason: 'caps',
      expectedVersion: 0,
    });

    scriptTodo(rig, {
      card_survey: [
        {
          read_requests: [
            { op: 'read', path: 'package.json' },
            { op: 'read', path: 'src/index.ts' },
          ],
        },
        { findings: { summary: 'ok', predicted_lane: 'standard' } },
      ],
    });

    const id = await createPlanCard(rig);
    await rig.tick();

    expect(readOks(rig.llm.callsTo('card_survey')[1]?.input)).toEqual([true, false]);
    expect(
      (await eventsOf(rig, id, 'step_finished'))[0]?.payload.files_read,
    ).toHaveLength(1);
  });

  it('allows two read rounds and rejects a step that still asks after them', async () => {
    const rig = await planningRig();
    const ask = { read_requests: [{ op: 'grep', pattern: 'app' }] };
    scriptTodo(rig, { card_survey: [ask] });

    const id = await createPlanCard(rig);
    const report = await rig.tick();

    // First call plus two re-calls; the third answer is still a read request, so the step fails.
    expect(rig.llm.callsTo('card_survey')).toHaveLength(3);
    expect(rig.llm.callsTo('card_survey')[2]?.input).toMatchObject({
      reads_remaining: 0,
    });

    expect(await eventsOf(rig, id, 'step_finished')).toEqual([]);
    expect(report.rejectedSteps.map((r) => r.step)).toEqual(['card_survey']);
  });
});

describe('spend and plan reads', () => {
  it('counts Director steps on the card and warns once per level', async () => {
    const rig = await planningRig();
    await rig.config.append({
      scope: 'company',
      doc: { director: { budget_warning_usd: 0.05 } },
      author: 'test',
      reason: 'budget',
      expectedVersion: 0,
    });

    rig.llm.cost('grill_turn', 0.04);
    const id = await createPlanCard(rig);
    await rig.tick();
    await answerWith(rig, id);
    await rig.tick();

    // Each level warns once (the 80 percent heads-up, then the level itself), however many steps follow.
    const warnings = await eventsOf(rig, id, 'budget_warning');
    expect(warnings.map((w) => w.payload.threshold)).toEqual([0.8, 1]);
    expect(warnings[1]?.payload).toMatchObject({ cap_usd: 0.05 });
    // A warning never blocks: the plan was still written and approved.
    expect((await cardOf(rig, id)).phase).toBe('in_progress');
  });

  it('lists plan versions with the current plan and the floor result', async () => {
    const rig = await planningRig();
    const id = await createPlanCard(rig);
    await rig.tick();
    await answerWith(rig, id);
    await rig.tick();

    const plans = await rig.engine.cardPlans(id);
    expect(plans.status).toBe('ok');
    if (plans.status === 'ok') {
      expect(plans.versions.map((v) => v.version)).toEqual([1]);
      expect(plans.current?.version).toBe(1);
      expect(plans.floor).toEqual({ pass: true, reasons: [] });
    }

    expect((await rig.engine.cardPlan(id, 1)).status).toBe('ok');
    expect((await rig.engine.cardPlan(id, 7)).status).toBe('plan_not_found');
    expect((await rig.engine.cardPlans('FG-C42')).status).toBe('not_found');
  });
});
