/**
 * Scenario: a G1 failure on gate configuration alone goes to the owner, not to a rework.
 *
 * Why: the owner of a Forge project does not write code. A scaffold ticket's Worker adds
 *   `vitest.config.ts` because the ticket asks for it; G1's gate-config guard flags it, and a
 *   rework cannot change that (CHE-1 failed three times on the same head and ended in a dead-end
 *   card). The ticket must park at once, with no rework spent, on a decision card that names the
 *   files and offers Merge anyway (recorded as an owner override), Send back, Re-plan and Cancel;
 *   every other G1 failure keeps the bounded rework road, and a ticket already stuck at the
 *   rework cap on such a failure must pass on Retry once the guard no longer flags it (d-0173).
 *
 * Pins: a config-only failure holds with rework_count 0 and one run; the item is a `config_hold`
 *   decision naming the files with the four owner actions; Merge anyway records the override and
 *   the ticket reaches the merge door; Send back reworks; a failure without the config-only marker,
 *   or one mixed with another check, still reworks; a ticket parked at the rework cap passes on Retry.
 * Depends on: helpers/verify-rig, helpers/escalation-rig, helpers/fake-git-host, @forge/core, vitest.
 */

import { escalationActions, toEscalation } from '@forge/core';
import type { GateFinding, GateVerdict } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { overrideDirector, pendingOf } from '#tests/helpers/escalation-rig.js';
import { verdict } from '#tests/helpers/fake-git-host.js';
import { drive, makeVerifyRig, startAndFinish } from '#tests/helpers/verify-rig.js';

const CONFIG: GateFinding = {
  check: 'gate-config',
  file: 'vitest.config.ts',
  message: 'vitest.config.ts: gate configuration changed by the Worker (status A)',
};

const configOnly = (): GateVerdict => ({
  ...verdict('failed', [CONFIG]),
  configOnly: true,
});

const stageRows = (rig: Awaited<ReturnType<typeof makeVerifyRig>>['rig'], id: string) =>
  rig.storage.transaction((tx) => tx.stageRuns.listByTicket(id));

describe('verify: a config-only G1 failure holds for the owner', () => {
  it('parks with no rework spent and a config_hold decision that offers the four choices', async () => {
    const { rig, host, gate } = await makeVerifyRig();
    gate.script(configOnly());
    const id = await startAndFinish(rig);

    await rig.tick();

    const t = await rig.ticket(id);

    expect(t).toMatchObject({
      status: 'waiting_human',
      parked_from: 'verifying',
      rework_count: 0,
    });

    expect(t.blocked_reason).toMatch(/^config_hold: /);
    expect(rig.driver.starts).toHaveLength(1);
    expect(host.count('merge')).toBe(0);

    const [item] = await pendingOf(rig, id, 'decision');

    expect(item?.payload).toMatchObject({
      kind: 'decision',
      cause: 'config_hold',
      stage_label: 'G1',
      findings: [expect.objectContaining({ file: 'vitest.config.ts' })],
      rework: { count: 0, cap: 2 },
    });

    expect(JSON.stringify(item?.payload)).toContain(
      'review them, then Merge anyway or send it back',
    );

    expect(
      item && escalationActions(toEscalation(item).payload, { replannable: true }),
    ).toEqual(['merge_anyway', 'rework', 'replan', 'cancel']);

    expect((await stageRows(rig, id)).find((r) => r.status === 'waiting')).toBeDefined();
  });

  it('merges after Merge anyway, with the owner override on the held stage row', async () => {
    const { rig, host, gate } = await makeVerifyRig();
    gate.script(configOnly());
    const id = await startAndFinish(rig);
    await rig.tick();
    const [item] = await pendingOf(rig, id, 'decision');

    const out = await rig.engine.actOnEscalation(
      item?.id ?? '',
      { action: 'merge_anyway', comment: 'the scaffold needs its own vitest config' },
      'owner',
    );

    expect(out.status).toBe('done');

    const settled = await rig.storage.transaction((tx) =>
      tx.interactions.get(item?.id ?? ''),
    );

    expect(settled?.answer).toMatchObject({
      action: 'merge_anyway',
      by: 'owner',
      comment: 'the scaffold needs its own vitest config',
    });

    const held = (await stageRows(rig, id)).find((r) => r.outcome.override !== undefined);

    expect(held).toMatchObject({ status: 'passed' });
    expect(held?.outcome.override).toMatchObject({
      by: 'owner',
      action: 'merge_anyway',
    });

    await drive(rig, 6, async () => host.count('merge') > 0);

    expect(host.count('merge')).toBe(1);
    expect((await rig.ticket(id)).status).toBe('done');
    expect(rig.driver.starts).toHaveLength(1);
  });

  it('refuses Merge anyway from the Director: only the owner overrules a hold', async () => {
    const { rig, gate } = await makeVerifyRig();
    gate.script(configOnly());
    const id = await startAndFinish(rig);
    await rig.tick();
    const [item] = await pendingOf(rig, id, 'decision');

    const out = await rig.engine.actOnEscalation(
      item?.id ?? '',
      { action: 'merge_anyway', comment: 'the director says so' },
      'director',
    );

    expect(out).toEqual({ status: 'action_not_offered' });
    expect((await rig.ticket(id)).status).toBe('waiting_human');
  });

  it('sends the work back for rework on Send back, then merges once G1 passes', async () => {
    const { rig, host, gate } = await makeVerifyRig();
    gate.script(configOnly(), verdict('passed'));
    const id = await startAndFinish(rig);
    await rig.tick();
    const [item] = await pendingOf(rig, id, 'decision');

    const out = await rig.engine.actOnEscalation(
      item?.id ?? '',
      { action: 'rework', comment: 'use the project vitest config instead' },
      'owner',
    );

    expect(out.status).toBe('done');
    await drive(rig, 8, async () => (await rig.ticket(id)).status === 'done');

    expect(rig.driver.starts).toHaveLength(2);
    expect(host.count('merge')).toBe(1);
    expect((await rig.ticket(id)).status).toBe('done');
  });
});

describe('verify: every other G1 failure keeps the rework road', () => {
  it('reworks a gate-config failure that is not marked config-only (fail closed)', async () => {
    const { rig, gate } = await makeVerifyRig();
    gate.script(verdict('failed', [CONFIG]), verdict('passed'));
    const id = await startAndFinish(rig);

    await rig.tick();

    expect(await rig.ticket(id)).toMatchObject({
      status: 'in_progress',
      rework_count: 1,
    });

    expect(await pendingOf(rig, id, 'decision')).toEqual([]);
  });

  it('reworks a config finding mixed with another failing check', async () => {
    const { rig, gate } = await makeVerifyRig();
    gate.script(
      verdict('failed', [CONFIG, { check: 'project-checks', message: 'test failed' }]),
      verdict('passed'),
    );

    const id = await startAndFinish(rig);

    await rig.tick();

    expect(await rig.ticket(id)).toMatchObject({
      status: 'in_progress',
      rework_count: 1,
    });
  });

  it('reworks when the verdict status is error, even with the marker', async () => {
    const { rig, gate } = await makeVerifyRig();
    gate.script({ ...verdict('error', [CONFIG]), configOnly: true }, verdict('passed'));
    const id = await startAndFinish(rig);

    await rig.tick();

    expect(await pendingOf(rig, id, 'decision')).toEqual([]);
    expect((await rig.ticket(id)).rework_count).not.toBe(2);
  });
});

describe('verify: a ticket already stuck at the rework cap', () => {
  it('passes G1 on Retry once the guard no longer flags the files', async () => {
    const { rig, host, gate } = await makeVerifyRig();
    await overrideDirector(rig, { escalation: { director_first: false } });
    // The old road: the same unmarked config failure on every run until the cap.
    gate.script(verdict('failed', [CONFIG]));
    const id = await startAndFinish(rig);
    await drive(rig, 8, async () => (await rig.ticket(id)).status === 'waiting_human');

    const [row] = await pendingOf(rig, id, 'failure');

    expect(row?.payload).toMatchObject({ kind: 'failure', cause: 'rework_cap' });

    // The shipped guard allows the added files, so G1 now passes.
    gate.script(verdict('passed'));

    const out = await rig.engine.actOnEscalation(
      row?.id ?? '',
      { action: 'retry' },
      'owner',
    );

    expect(out.status).toBe('done');
    await drive(rig, 8, async () => (await rig.ticket(id)).status === 'done');

    expect(host.count('merge')).toBe(1);
    expect((await rig.ticket(id)).status).toBe('done');
  });
});
