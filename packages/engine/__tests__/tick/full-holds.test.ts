/**
 * Pins what the Full lane does when a check will not pass cleanly: hold, override, send back, scope
 * drift, a failing Director check, a ticket with no plan.
 *
 * Why: a reviewer or a critic can be wrong and a plan can be honestly outgrown, so the owner must be
 *   able to overrule a hold, but knowingly (a written reason, on the record) and never on a failed
 *   gate. The Director's own check must fail closed: an error, or no plan to check against, can never
 *   become a pass or a Director signature. And every hold is one item the owner can act on from the
 *   card, the ticket page and the Inbox, never a bare status (d-0135).
 *
 * Pins: Done-when 4 (a critic `high` holds at once; merge anyway needs five characters and is owner
 *   only; the row then reads passed with the override, then sign-off by the owner, then merge; rework
 *   from a hold keeps the rework count and carries findings and comment). Scope drift, the failing
 *   Director check and the two doors are in full-scope-and-failures.test.ts.
 * Depends on: helpers/full-rig, helpers/pipeline-rig, helpers/scripted-llm, @forge/core, vitest.
 */

import { EscalationActBody, escalationActions, toEscalation } from '@forge/core';
import { describe, expect, it } from 'vitest';
import {
  holdByCritic,
  makeFullRig,
  pendingItem,
  settleTicks,
} from '#tests/helpers/full-rig.js';
import { runIds, stageRows } from '#tests/helpers/pipeline-rig.js';

describe('a critic holds at once', () => {
  it('parks the ticket from verifying with a findings_hold decision and no rework spent', async () => {
    const v = await makeFullRig('A');
    const id = await holdByCritic(v);
    const t = await v.rig.ticket(id);

    expect(t).toMatchObject({
      status: 'waiting_human',
      parked_from: 'verifying',
      rework_count: 0,
    });

    const item = await pendingItem(v, id, 'decision');

    expect(item?.payload).toMatchObject({
      kind: 'decision',
      cause: 'findings_hold',
      stage_id: 'review-group',
      rework: { count: 0, cap: 2 },
    });

    expect(item?.payload).toMatchObject({
      findings: [expect.objectContaining({ file: 'src/a.ts', line: 12 })],
    });

    expect(
      item && escalationActions(toEscalation(item).payload, { replannable: true }),
    ).toEqual(['merge_anyway', 'rework', 'replan', 'cancel']);

    expect(
      (await stageRows(v.rig, id)).find((r) => r.member_id === 'critique')?.status,
    ).toBe('waiting');
  });

  it('refuses merge anyway without five characters of reason, and from the Director', async () => {
    const v = await makeFullRig('A');
    const id = await holdByCritic(v);
    const item = await pendingItem(v, id, 'decision');

    expect(
      EscalationActBody.safeParse({ action: 'merge_anyway', comment: 'four' }).success,
    ).toBe(false);

    expect(
      EscalationActBody.safeParse({ action: 'continue', comment: '   ' }).success,
    ).toBe(false);

    const out = await v.rig.engine.actOnEscalation(
      item?.id ?? '',
      { action: 'merge_anyway', comment: 'the director says so' },
      'director',
    );

    expect(out).toEqual({ status: 'action_not_offered' });
    expect((await v.rig.ticket(id)).status).toBe('waiting_human');
  });

  it('overrides on the record: the row passes with the override, the owner signs, then it merges', async () => {
    const v = await makeFullRig('A');
    const { rig, host } = v;
    const id = await holdByCritic(v);
    const item = await pendingItem(v, id, 'decision');

    const out = await rig.engine.actOnEscalation(
      item?.id ?? '',
      { action: 'merge_anyway', comment: 'handled upstream in the loader' },
      'owner',
    );

    expect(out.status).toBe('done');
    const settled = await rig.storage.transaction((tx) =>
      tx.interactions.get(item?.id ?? ''),
    );

    expect(settled?.answer).toMatchObject({
      action: 'merge_anyway',
      by: 'owner',
      comment: 'handled upstream in the loader',
    });

    const held = (await stageRows(rig, id)).find((r) => r.member_id === 'critique');

    expect(held).toMatchObject({ status: 'passed' });
    expect(held?.outcome.override).toMatchObject({
      by: 'owner',
      action: 'merge_anyway',
      comment: 'handled upstream in the loader',
    });

    await settleTicks(v);

    // The owner overruled a stage, so the Director leaves the signature to the owner.
    expect(await rig.ticket(id)).toMatchObject({ status: 'review', rework_count: 0 });
    const signOff = await pendingItem(v, id, 'sign_off');

    expect(signOff?.payload).toMatchObject({
      cause: 'director_declined',
      checks: { overrides: 1 },
    });

    expect(host.count('merge')).toBe(0);

    const done = await rig.engine.actOnEscalation(
      signOff?.id ?? '',
      { action: 'approve' },
      'owner',
    );

    expect(done.status).toBe('done');
    expect(await rig.ticket(id)).toMatchObject({ status: 'done' });
    expect(host.count('merge')).toBe(1);
  });

  it('sends the held work back for rework without spending a rework, carrying findings and comment', async () => {
    const v = await makeFullRig('A');
    const { rig } = v;
    const id = await holdByCritic(v);
    const item = await pendingItem(v, id, 'decision');

    const out = await rig.engine.actOnEscalation(
      item?.id ?? '',
      { action: 'rework', comment: 'please handle the null case' },
      'owner',
    );

    expect(out.status).toBe('done');
    expect(await rig.ticket(id)).toMatchObject({
      status: 'in_progress',
      rework_count: 0,
    });

    await rig.tick();

    const starts = runIds(rig);
    const last = starts.at(-1) as string;
    const step = rig.llm.callsTo('dispatch_prompt').at(-1);

    expect(last).toBe('run-5');
    expect(JSON.stringify(step?.input)).toContain('please handle the null case');
    expect(JSON.stringify(step?.input)).toContain('the null case is not handled');
    expect(await pendingItem(v, id, 'decision')).toBeUndefined();
  });
});
