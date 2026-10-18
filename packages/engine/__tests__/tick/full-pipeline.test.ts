/**
 * Pins the Full lane end to end: tests first, the implementation, G1, a reviewer and a critic, the
 * Director's check against the plan, a sign-off, then merge.
 *
 * Why: Full is the lane for work that deserves the most scrutiny, and each of its stages is a
 *   different judge: independent agents who never read the Worker's own account, a Director check
 *   over the plan's typed artifacts only, and a sign-off the Director gives only for low-risk work
 *   that passed everything. If the reviewer and the critic ran as two Workers at once under a limit
 *   of one, the Director's check read the Worker's story, the Director signed tier C, or the owner
 *   were asked to review every tier A ticket anyway, the lane would be either unsafe or noise. Tier C
 *   (auth, migrations, secrets) must always wait for a named person (d-0012, d-0141 item 9).
 *
 * Pins: Done-when 3 (the reviewer and the critic placed in separate ticks, Director check pass,
 *   Director signs tier A and merges; tier B goes through review to done with a card note; tier C
 *   waits in needs_signoff with a sign_off item and a named signer finishes it; the check's prompt
 *   holds no sentinel from the finish summary or claims).
 * Depends on: helpers/full-rig, helpers/pipeline-rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  cardNotes,
  makeFullRig,
  passChecks,
  pendingItem,
  toChecks,
} from '#tests/helpers/full-rig.js';
import {
  agentOf,
  review,
  reviewDone,
  runIds,
  stageRows,
} from '#tests/helpers/pipeline-rig.js';

const SENTINEL = 'SENTINEL-IMPLEMENTER-NARRATIVE-9c1d';

describe('Full lane, tier A', () => {
  it('runs the reviewer and the critic in separate ticks, checks the plan and lets the Director sign and merge', async () => {
    const v = await makeFullRig('A');
    const { rig, host } = v;
    const id = await toChecks(v, { sentinel: SENTINEL });

    // One Worker slot per project: only the reviewer was placed.
    expect(runIds(rig)).toEqual(['run-1', 'run-2', 'run-3']);
    expect(await agentOf(rig, 'run-3')).toBe('reviewer');

    await reviewDone(rig, 'run-3', review('pass'));
    await rig.tick();

    expect(runIds(rig)).toEqual(['run-1', 'run-2', 'run-3', 'run-4']);
    expect(await agentOf(rig, 'run-4')).toBe('critic');
    expect(host.count('merge')).toBe(0);

    await passChecksFrom(v);

    expect(await rig.ticket(id)).toMatchObject({ status: 'done', tier_actual: 'A' });
    expect(host.count('merge')).toBe(1);
    const rows = await stageRows(rig, id);
    expect(rows.map((r) => [r.stage_id, r.member_id, r.kind, r.status])).toEqual([
      ['test-writer', '', 'agent', 'passed'],
      ['test-writer', 'proof', 'script_gate', 'passed'],
      ['implementer', '', 'agent', 'passed'],
      ['g1', '', 'script_gate', 'passed'],
      ['review-group', 'review', 'agent', 'passed'],
      ['review-group', 'critique', 'agent', 'passed'],
      ['check-plan', '', 'director', 'passed'],
      ['sign-off', '', 'director', 'passed'],
    ]);

    const signed = rows.find((r) => r.stage_id === 'sign-off');
    expect(signed?.outcome).toMatchObject({ signed_by: 'director' });
    expect(signed?.outcome.sign_reason).toContain('Tier A');
  });

  it('shows the Director check typed artifacts only: no sentinel from the finish summary or its claims', async () => {
    const v = await makeFullRig('A');
    const { rig } = v;
    rig.worktrees.patch = 'diff --git a/src/a.ts b/src/a.ts\n+changed line';
    await toChecks(v, { sentinel: SENTINEL });
    await passChecks(v);

    const calls = rig.llm.callsTo('ticket_check');
    const text = JSON.stringify(calls[0]?.input);

    expect(calls).toHaveLength(1);
    expect(text).toContain('+changed line');
    expect(text).toContain('the doctor check passes');
    expect(text).not.toContain(SENTINEL);
    expect(text).not.toContain('finish_claims');
    expect(text).not.toContain('narrative');
    expect(text).not.toContain('src/a.test.ts');
  });
});

describe('Full lane, tier B', () => {
  it('lets the Director sign tier B: review, then done through the owner door, with a card note', async () => {
    const v = await makeFullRig('B');
    const { rig, host } = v;
    const id = await toChecks(v);
    await passChecks(v);

    expect(await rig.ticket(id)).toMatchObject({ status: 'done', tier_actual: 'B' });
    expect(host.count('merge')).toBe(1);
    expect(await pendingItem(v, id, 'sign_off')).toBeUndefined();
    const notes = await cardNotes(v, id);

    expect(notes.some((n) => n.startsWith('Signed off by the Director (tier B):'))).toBe(
      true,
    );
  });
});

describe('Full lane, tier C', () => {
  it('never lets the Director sign tier C: needs_signoff with a sign_off item, finished by a named person', async () => {
    const v = await makeFullRig('C');
    const { rig, host } = v;
    rig.worktrees.changed = ['src/auth/login.ts'];
    const id = await toChecks(v, { plan: { files: ['src/auth/login.ts'] } });
    await passChecks(v);

    expect(await rig.ticket(id)).toMatchObject({
      status: 'needs_signoff',
      tier_actual: 'C',
    });

    expect(host.count('merge')).toBe(0);
    const item = await pendingItem(v, id, 'sign_off');

    expect(item?.payload).toMatchObject({ kind: 'sign_off', cause: 'tier_c', tier: 'C' });
    expect(item?.payload).toMatchObject({
      director_note: expect.stringContaining('Tier C'),
    });

    const out = await rig.engine.actOnEscalation(
      item?.id ?? '',
      { action: 'sign_off', signer: 'vikash' },
      'owner',
    );

    expect(out.status).toBe('done');
    expect(await rig.ticket(id)).toMatchObject({ status: 'done' });
    expect(host.count('merge')).toBe(1);
    const row = (await stageRows(rig, id)).find((r) => r.stage_id === 'sign-off');

    expect(row).toMatchObject({ status: 'passed', kind: 'human' });
    expect(row?.outcome.signed_by).toBe('owner');
  });
});

/** The critic (run-4) passes and the ticks that follow apply the Director check and the sign-off. */
async function passChecksFrom(v: Awaited<ReturnType<typeof makeFullRig>>): Promise<void> {
  const { rig } = v;
  await reviewDone(rig, 'run-4', review('pass'));
  for (let i = 0; i < 4; i++) {
    await rig.tick();
    await rig.flush();
  }
}
