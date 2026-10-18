/**
 * Pins how the Director tailors a ticket's pipeline from the plan the owner approved, at the ticket's first dispatch
 * and when a heavier lane re-snapshots it.
 *
 * Why: the plan is where the Director may say "this ticket needs a security reviewer" (d-0149), and the owner
 *   approves that with the plan. What the planner writes is untrusted, so each op is checked again at the ticket's
 *   first dispatch, when the owner may have edited the lane since (an op that no longer holds is recorded dropped and
 *   the owner's list runs, the ticket never parks), and a heavier lane keeps the ops that still apply and drops the
 *   one whose anchor is gone. Locked stages are never touched (their limits are pinned in core and at plan time).
 *
 * Pins: Done-when 3 (applied op with card note, base hash and strip change; anchor gone while approved, base list
 *   runs and the ticket is not parked) and 5 (a lane raise re-applies, an op without its anchor is dropped).
 * Depends on: helpers/adjust-rig, helpers/planning-rig, helpers/pipeline-rig, @forge/core, vitest.
 */

import { BUILTIN_PIPELINES, pipelineHash, ticketPipelineView } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  WHY,
  addSecurity,
  planWith,
  planned,
  setProject,
  snapshotOf,
  withSecurity,
} from '#tests/helpers/adjust-rig.js';
import { stageRows, writerDone } from '#tests/helpers/pipeline-rig.js';
import { cardOf, eventsOf, planningRig, tickets } from '#tests/helpers/planning-rig.js';

describe('a plan op applied at the first dispatch', () => {
  it('adds the reviewer, records it, notes it on the card and shows it on the strip', async () => {
    const rig = await planningRig();
    await setProject(rig, withSecurity);
    const card = await planned(rig, planWith([addSecurity]));
    await rig.tick();

    const [ticket] = await tickets(rig, card);
    const snap = await snapshotOf(rig, ticket!.id);

    expect(snap?.definition.stages.map((s) => s.id)).toEqual([
      'test-writer',
      'implementer',
      'g1',
      'dir-security',
      'reviewer',
      'merge',
    ]);

    expect(snap?.adjustments).toHaveLength(1);
    expect(snap?.adjustments[0]).toMatchObject({
      status: 'applied',
      cause: 'plan',
      by: 'director',
      plan_version: 1,
      key: 'standard:add:security-reviewer@after:g1',
    });

    expect(snap?.base_hash).toBe(pipelineHash(BUILTIN_PIPELINES.standard));
    expect(snap?.hash).not.toBe(snap?.base_hash);
    expect(snap?.hash).toBe(pipelineHash(snap!.definition));
    expect(snap?.roles['security-reviewer']).toBe('reviewer');

    const notes = (await eventsOf(rig, card, 'note')).map((e) => e.payload.text);

    expect(notes.some((n) => n.includes('security-reviewer') && n.includes(WHY))).toBe(
      true,
    );

    const view = ticketPipelineView(
      snap!,
      await stageRows(rig, ticket!.id),
      [],
      ticket!,
      [],
    );

    expect(view.stages.find((s) => s.id === 'dir-security')?.changed).toMatchObject({
      by: 'director',
      op: 'add',
      cause: 'plan',
      reason: WHY,
    });

    expect(view.base_hash).toBe(snap?.base_hash);
  });

  it('writes the plain base list, with no adjustments, for a plan with no ops', async () => {
    const rig = await planningRig();
    const card = await planned(rig, planWith([]));
    await rig.tick();

    const [ticket] = await tickets(rig, card);
    const snap = await snapshotOf(rig, ticket!.id);

    expect(snap?.adjustments).toEqual([]);
    expect(snap?.base_hash).toBe(snap?.hash);
  });

  it('records the op as dropped, runs the owner list and does not park when the owner edited the lane after approval', async () => {
    const rig = await planningRig();
    await setProject(rig, withSecurity);
    // The owner approves by hand, so nothing dispatches until after the lane edit below.
    await rig.config.append({
      scope: 'company',
      doc: { director: { approval_mode: 'always_ask' } },
      author: 'test',
      reason: 'ask',
      expectedVersion: 0,
    });

    const card = await planned(rig, planWith([{ ...addSecurity, after: 'reviewer' }]));

    expect((await cardOf(rig, card)).phase).toBe('plan_ready');
    expect((await rig.engine.approvePlan(card, 1, 'owner')).status).toBe('approved');

    // The owner takes the reviewer out of Standard before the ticket's first dispatch: the anchor is gone.
    await setProject(rig, {
      ...withSecurity,
      pipelines: {
        standard: {
          stages: [
            {
              id: 'implementer',
              kind: 'agent',
              label: 'Implement',
              agent: 'implementer',
            },
            { id: 'g1', kind: 'script_gate', label: 'Gate G1', run: { builtin: 'g1' } },
            { id: 'merge', kind: 'merge', label: 'Merge', locked: true },
          ],
        },
      },
    });

    await rig.tick();

    const [ticket] = await tickets(rig, card);
    const snap = await snapshotOf(rig, ticket!.id);

    expect(snap?.adjustments[0]).toMatchObject({ status: 'dropped' });
    expect(snap?.adjustments[0]?.problem).toBeDefined();
    expect(snap?.definition.stages.map((s) => s.id)).toEqual([
      'implementer',
      'g1',
      'merge',
    ]);

    expect(snap?.hash).toBe(snap?.base_hash);
    // Not parked: the ticket's first run started on the owner's list.
    expect(ticket?.status).not.toBe('waiting_human');
    expect(rig.driver.starts.length).toBeGreaterThan(0);
  });
});

describe('a lane raised after the ticket started', () => {
  it('re-applies the recorded ops to the heavier lane, and drops the one whose anchor is gone', async () => {
    const rig = await planningRig();
    await setProject(rig, withSecurity);
    const plan = planWith([
      addSecurity,
      {
        op: 'add',
        stage: {
          id: 'dir-late',
          kind: 'agent',
          label: 'Late review',
          agent: 'security-reviewer',
        },
        after: 'reviewer',
        reason: 'A second look after the standard review.',
      },
    ]);

    const card = await planned(rig, plan);
    await rig.tick();
    const [ticket] = await tickets(rig, card);
    const first = await snapshotOf(rig, ticket!.id);

    expect(first?.adjustments.map((a) => a.status)).toEqual(['applied', 'applied']);

    // The test-writer's run is over; the lane is raised before its outcome is applied.
    await writerDone(rig, 'run-1', [{ kind: 'edited', path: 'src/auth-check.test.ts' }]);
    const fresh = await rig.ticket(ticket!.id);
    await rig.storage.transaction((tx) =>
      tx.tickets.updateTicketCas(fresh.id, fresh.status_version, { lane: 'full' }),
    );

    await rig.tick();

    const snap = await snapshotOf(rig, ticket!.id);

    expect(snap?.lane).toBe('full');
    expect(
      snap?.adjustments.map((a) => [a.op.op === 'add' ? a.op.stage.id : '', a.status]),
    ).toEqual([
      ['dir-security', 'applied'],
      ['dir-late', 'dropped'],
    ]);

    expect(snap?.definition.stages.map((s) => s.id)).toContain('dir-security');
    expect(snap?.definition.stages.map((s) => s.id)).not.toContain('dir-late');
    expect(snap?.base_hash).toBe(pipelineHash(BUILTIN_PIPELINES.full));
  });
});
