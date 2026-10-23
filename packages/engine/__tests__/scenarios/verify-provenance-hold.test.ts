/**
 * Scenario: a G1 failure that is only a lost earlier-run proof is reworked, then held for the owner.
 *
 * Why: a Worker run that hit its turn limit left edits in the branch whose proof (its run secret)
 *   is gone, so no later run can claim them (eval FR-11: the ticket failed G1 three times and
 *   dead-ended). The first road is the ordinary rework, whose prompt tells the Worker to re-apply
 *   the files through its own tools. When the automatic reworks are spent the owner, who does not
 *   write code, must get a decision card that names the files and offers Merge anyway (recorded
 *   as an owner override), Send back, Re-plan and Cancel, not the dead-end rework-cap failure.
 *   Anything not marked provenance-only keeps the old road (F-D3, same engine path as d-0173).
 *
 * Pins: a provenance-only failure reworks while the cap allows with the re-apply words in the
 *   Worker's wake; once spent it holds with a `provenance_hold` decision naming the files and
 *   offering the four owner actions; Merge anyway records the override and reaches the merge door;
 *   an unmarked failure still ends at the rework cap.
 * Depends on: helpers/verify-rig, helpers/escalation-rig, helpers/fake-git-host, @forge/core, vitest.
 */

import { escalationActions, toEscalation } from '@forge/core';
import type { GateFinding, GateVerdict } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { overrideDirector, pendingOf } from '#tests/helpers/escalation-rig.js';
import { verdict } from '#tests/helpers/fake-git-host.js';
import { drive, makeVerifyRig, startAndFinish } from '#tests/helpers/verify-rig.js';

const LOST: GateFinding = {
  check: 'claims',
  file: 'src/cli.ts',
  message:
    "src/cli.ts was changed by earlier run run-x, but that run's proof is gone. Fix: re-apply src/cli.ts through your edit/write tool (rewrite it as it should be) and claim it as edited.",
};

const provenanceOnly = (): GateVerdict => ({
  ...verdict('failed', [LOST]),
  provenanceOnly: true,
});

const spent = async (
  rig: Awaited<ReturnType<typeof makeVerifyRig>>['rig'],
  id: string,
) => {
  await overrideDirector(rig, { escalation: { director_first: false } });
  await drive(rig, 12, async () => (await rig.ticket(id)).status === 'waiting_human');
};

describe('verify: a provenance-only G1 failure', () => {
  it('reworks first, and the Worker is told to re-apply the files', async () => {
    const { rig, gate } = await makeVerifyRig();
    gate.script(provenanceOnly(), verdict('passed'));
    const id = await startAndFinish(rig);

    await rig.tick();

    expect(await rig.ticket(id)).toMatchObject({
      status: 'in_progress',
      rework_count: 1,
    });

    expect(await pendingOf(rig, id, 'decision')).toEqual([]);

    await drive(rig, 8, async () => rig.driver.starts.length > 1);

    const step = rig.llm.callsTo('dispatch_prompt').at(-1);

    expect(JSON.stringify(step?.input)).toContain(
      're-apply src/cli.ts through your edit/write tool',
    );
  });

  it('holds for the owner with a provenance_hold decision once the reworks are spent', async () => {
    const { rig, host, gate } = await makeVerifyRig();
    gate.script(provenanceOnly());
    const id = await startAndFinish(rig);
    await spent(rig, id);

    const t = await rig.ticket(id);

    expect(t).toMatchObject({ status: 'waiting_human', parked_from: 'verifying' });
    expect(t.blocked_reason).toMatch(/^provenance_hold: /);
    expect(host.count('merge')).toBe(0);
    expect(await pendingOf(rig, id, 'failure')).toEqual([]);

    const [item] = await pendingOf(rig, id, 'decision');

    expect(item?.payload).toMatchObject({
      kind: 'decision',
      cause: 'provenance_hold',
      stage_label: 'G1',
      findings: [expect.objectContaining({ file: 'src/cli.ts' })],
    });

    expect(
      item && escalationActions(toEscalation(item).payload, { replannable: true }),
    ).toEqual(['merge_anyway', 'rework', 'replan', 'cancel']);
  });

  it('merges after Merge anyway, with the owner override recorded', async () => {
    const { rig, host, gate } = await makeVerifyRig();
    gate.script(provenanceOnly());
    const id = await startAndFinish(rig);
    await spent(rig, id);
    const [item] = await pendingOf(rig, id, 'decision');

    const out = await rig.engine.actOnEscalation(
      item?.id ?? '',
      { action: 'merge_anyway', comment: 'I read the diff, it is fine' },
      'owner',
    );

    expect(out.status).toBe('done');

    const held = (
      await rig.storage.transaction((tx) => tx.stageRuns.listByTicket(id))
    ).find((r) => r.outcome.override !== undefined);

    expect(held?.outcome.override).toMatchObject({ by: 'owner', action: 'merge_anyway' });

    await drive(rig, 6, async () => host.count('merge') > 0);

    expect(host.count('merge')).toBe(1);
    expect((await rig.ticket(id)).status).toBe('done');
  });

  it('still ends at the rework cap when the failure is not marked provenance-only', async () => {
    const { rig, gate } = await makeVerifyRig();
    gate.script(verdict('failed', [LOST]));
    const id = await startAndFinish(rig);
    await spent(rig, id);

    expect(await pendingOf(rig, id, 'decision')).toEqual([]);

    const [row] = await pendingOf(rig, id, 'failure');

    expect(row?.payload).toMatchObject({ kind: 'failure', cause: 'rework_cap' });
  });
});
