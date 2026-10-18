/**
 * Pins the Full lane's scope drift, its fail-closed Director check and the two doors to one item.
 *
 * Why: work can honestly outgrow its plan, the Director's own check must never turn an error or a
 *   missing plan into a pass or a signature, and an item the owner can act on from the card and from
 *   the ticket page must be one item, settled once, whichever door is used (d-0135).
 *
 * Pins: Done-when 5 (unplanned files plus `out_of_plan` raise a scope_drift decision offering continue,
 *   replan, cancel; continue proceeds on the record; replan goes to the card) and 6 (an erroring step is
 *   retried then parks with a failure, never passes or signs; no plan skips the check and the owner
 *   signs); approving through the ticket door settles the sign-off item and a second act finds it settled.
 * Depends on: helpers/full-rig, helpers/pipeline-rig, helpers/scripted-llm, @forge/core, vitest.
 */

import { escalationActions, toEscalation } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  cardNotes,
  makeFullRig,
  pendingItem,
  settleTicks,
  toChecks,
} from '#tests/helpers/full-rig.js';
import { review, reviewDone, stageRows } from '#tests/helpers/pipeline-rig.js';
import type { PipelineRig } from '#tests/helpers/pipeline-rig.js';
import { fail } from '#tests/helpers/scripted-llm.js';

describe('scope drift', () => {
  async function drift(): Promise<{ v: PipelineRig; id: string }> {
    const v = await makeFullRig('A');
    v.rig.worktrees.changed = ['src/a.ts', 'src/other.ts'];
    v.rig.llm.script('ticket_check', {
      verdict: 'out_of_plan',
      summary: 'It also rewrote other.ts.',
      acceptance: [
        { criterion: 'the doctor check passes', met: 'yes', evidence: 'src/a.ts:1' },
      ],
      findings: [],
      confidence: 0.8,
    });

    const id = await toChecks(v);
    await reviewDone(v.rig, 'run-3', review('pass'));
    await v.rig.tick();
    await reviewDone(v.rig, 'run-4', review('pass'));
    await settleTicks(v);

    return { v, id };
  }

  it('raises a scope_drift decision with the unplanned files and offers continue, replan, cancel', async () => {
    const { v, id } = await drift();
    const item = await pendingItem(v, id, 'decision');

    expect(item?.payload).toMatchObject({
      kind: 'decision',
      cause: 'scope_drift',
      unplanned: ['src/other.ts'],
    });

    expect(
      item && escalationActions(toEscalation(item).payload, { replannable: true }),
    ).toEqual(['continue', 'replan', 'cancel']);

    expect((await v.rig.ticket(id)).blocked_reason).toMatch(/^scope_drift: /);
  });

  it('continues on the record: the row passes with the override and the owner signs', async () => {
    const { v, id } = await drift();
    const item = await pendingItem(v, id, 'decision');

    await v.rig.engine.actOnEscalation(
      item?.id ?? '',
      { action: 'continue', comment: 'other.ts needed the same fix' },
      'owner',
    );

    await settleTicks(v);
    const row = (await stageRows(v.rig, id)).find((r) => r.stage_id === 'check-plan');

    expect(row).toMatchObject({ status: 'passed' });
    expect(row?.outcome.override).toMatchObject({ action: 'continue' });
    expect(await v.rig.ticket(id)).toMatchObject({ status: 'review' });
  });

  it('sends the card back to the Director on replan', async () => {
    const { v, id } = await drift();
    const item = await pendingItem(v, id, 'decision');
    const out = await v.rig.engine.actOnEscalation(
      item?.id ?? '',
      { action: 'replan', comment: 'split this into two tickets' },
      'owner',
    );

    expect(out.status).toBe('done');
    const card = (await v.rig.ticket(id)).card_id;
    const phase = await v.rig.storage.transaction((tx) => tx.cards.get(card as never));

    expect(phase?.phase).toBe('grilling');
  });
});

describe('the Director check fails closed', () => {
  it('retries an erroring step, then parks the ticket with a failure and never passes or signs', async () => {
    const v = await makeFullRig('A');
    const { rig, host } = v;
    rig.llm.script(
      'ticket_check',
      fail({ kind: 'unknown', message: 'the model fell over' }),
    );

    const id = await toChecks(v);
    await reviewDone(rig, 'run-3', review('pass'));
    await rig.tick();
    await reviewDone(rig, 'run-4', review('pass'));
    for (let i = 0; i < 8; i++) {
      await settleTicks(v, 2);
      rig.clock.advance(61_000);
    }

    const t = await rig.ticket(id);
    expect(t).toMatchObject({ status: 'waiting_human', parked_from: 'verifying' });
    expect(t.blocked_reason).toContain('the Director check could not finish');
    expect(await pendingItem(v, id, 'failure')).toBeDefined();
    expect(host.count('merge')).toBe(0);
    const rows = await stageRows(rig, id);

    expect(rows.find((r) => r.stage_id === 'check-plan')?.status).toBe('error');
    expect(rows.find((r) => r.stage_id === 'sign-off')).toBeUndefined();
    expect(rig.llm.callsTo('ticket_check').length).toBeGreaterThanOrEqual(2);
  });

  it('skips the check for a ticket with no plan, and leaves the signature to the owner', async () => {
    const v = await makeFullRig('A');
    const { rig, host } = v;
    const id = await toChecks(v, { plan: false });
    await reviewDone(rig, 'run-3', review('pass'));
    await rig.tick();
    await reviewDone(rig, 'run-4', review('pass'));
    await settleTicks(v);

    expect(rig.llm.callsTo('ticket_check')).toHaveLength(0);
    const rows = await stageRows(rig, id);

    expect(rows.find((r) => r.stage_id === 'check-plan')).toMatchObject({
      kind: 'director',
      status: 'skipped',
    });

    expect(await rig.ticket(id)).toMatchObject({ status: 'review' });
    expect(host.count('merge')).toBe(0);
    const item = await pendingItem(v, id, 'sign_off');

    expect(item?.payload).toMatchObject({ cause: 'director_declined' });
    expect(await cardNotes(v, id)).not.toContain('Signed off by the Director');
  });
});

describe('one item, two doors', () => {
  it('settles the sign-off item when the owner acts on the ticket, and a second act finds it settled', async () => {
    const v = await makeFullRig('A');
    const { rig, host } = v;
    const id = await toChecks(v, { plan: false });
    await reviewDone(rig, 'run-3', review('pass'));
    await rig.tick();
    await reviewDone(rig, 'run-4', review('pass'));
    await settleTicks(v);
    const item = await pendingItem(v, id, 'sign_off');

    const out = await rig.engine.actOnTicket(id, { action: 'approve' }, 'owner');

    expect(out.status).toBe('done');
    expect(host.count('merge')).toBe(1);
    const row = await rig.storage.transaction((tx) =>
      tx.interactions.get(item?.id ?? ''),
    );

    expect(row).toMatchObject({ status: 'answered' });
    expect(row?.answer).toMatchObject({ action: 'approve', by: 'owner' });
    expect(
      await rig.engine.actOnEscalation(item?.id ?? '', { action: 'approve' }, 'owner'),
    ).toMatchObject({
      status: 'not_pending',
    });
  });
});

describe('sending finished work back from its sign-off item', () => {
  it('settles the item with the comment, restarts at the last writer and spends no automatic rework', async () => {
    const v = await makeFullRig('A');
    const { rig } = v;
    const id = await toChecks(v, { plan: false });
    await reviewDone(rig, 'run-3', review('pass'));
    await rig.tick();
    await reviewDone(rig, 'run-4', review('pass'));
    await settleTicks(v);
    const item = await pendingItem(v, id, 'sign_off');

    const out = await rig.engine.actOnEscalation(
      item?.id ?? '',
      { action: 'rework', comment: 'please rename the flag' },
      'owner',
    );

    expect(out.status).toBe('done');
    const row = await rig.storage.transaction((tx) =>
      tx.interactions.get(item?.id ?? ''),
    );

    expect(row).toMatchObject({ status: 'answered' });
    expect(row?.answer).toMatchObject({
      action: 'rework',
      by: 'owner',
      comment: 'please rename the flag',
    });

    expect(await rig.ticket(id)).toMatchObject({
      status: 'in_progress',
      rework_count: 0,
    });

    await rig.tick();

    const step = rig.llm.callsTo('dispatch_prompt').at(-1);

    expect(JSON.stringify(step?.input)).toContain('please rename the flag');
    expect(
      (await stageRows(rig, id)).find(
        (r) => r.stage_id === 'implementer' && r.cycle === 1,
      ),
    ).toMatchObject({ status: 'running' });
  });
});
