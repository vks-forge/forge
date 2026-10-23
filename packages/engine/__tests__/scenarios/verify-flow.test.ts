/**
 * Scenario: a finished run is published, gated and merged, handed back or parked.
 *
 * Why: this is where a Worker's "done" becomes either shipped code or a bounded retry. If
 *   a PR could be opened twice, a merge happen without a tier-A pass, a failed gate lose
 *   its findings, or a transient host error park a ticket for a human, the factory would
 *   either ship unchecked work or stall on faults it should absorb. Each scenario pins one
 *   of those promises through the fakes for git host, gates and worktrees.
 *
 * Pins: success to done with one PR and cleanup; tier B and tier C stop for a human with
 *   no merge; a failed gate reworks with findings in the prompt and a `retry_of` run; the
 *   rework cap parks naming the gate. Faults and the merge invariant: verify-faults.test.ts.
 * Depends on: helpers/verify-rig, helpers/fake-git-host, @forge/core, fast-check, vitest.
 */

import { describe, expect, it } from 'vitest';
import { verdict } from '#tests/helpers/fake-git-host.js';
import type { Rig } from '#tests/helpers/rig.js';
import {
  drive,
  finishRun,
  makeVerifyRig,
  startAndFinish,
} from '#tests/helpers/verify-rig.js';

const gateRows = (rig: Rig, id: string) =>
  rig.storage.transaction((tx) => tx.gateResults.listByTicket(id));

describe('verify: success path', () => {
  it('commits, pushes, opens one PR, records gates, merges tier A and cleans up', async () => {
    const { rig, host, gate } = await makeVerifyRig();
    const id = await startAndFinish(rig, [{ kind: 'edited', path: 'src/a.ts' }]);

    const report = await rig.tick();

    expect(report.verified).toEqual([
      expect.objectContaining({
        ticketId: id,
        runId: 'run-1',
        outcome: 'merged',
        gates: [{ gate: 'G1', status: 'passed' }],
      }),
    ]);

    const t = await rig.ticket(id);
    expect(t).toMatchObject({ status: 'done', tier_actual: 'A', pr_number: 42 });
    expect(t.pr_url).toBe('https://git.test/pr/42');
    // The base is fetched once per tick: at dispatch, when the branch is brought up to date, and at the merge door.
    expect(host.calls).toEqual([
      'syncBase:refs/forge/base/main',
      'syncBase:refs/forge/base/main',
      'push:fix/FG-1-scripted-triage-title',
      'findPr:fix/FG-1-scripted-triage-title',
      'openPr:fix/FG-1-scripted-triage-title',
      'syncBase:refs/forge/base/main',
      'prStatus:42',
      'merge:42',
      'deleteBranch:fix/FG-1-scripted-triage-title',
    ]);

    expect(rig.worktrees.commits).toEqual([
      {
        path: '/repo/.worktrees/FG-1',
        message: [
          'fix(FG-1): Scripted triage title',
          '',
          'Forge-Ticket: FG-1',
          'Forge-Run: run-1',
        ].join('\n'),
      },
    ]);

    expect(rig.worktrees.removed).toEqual(['/repo/.worktrees/FG-1']);
    expect(await gateRows(rig, id)).toEqual([
      expect.objectContaining({ run_id: 'run-1', gate: 'G1', status: 'passed' }),
    ]);

    expect(rig.reports.saved).toEqual([
      { runId: 'run-1', name: 'G1-head-sha-1.txt', text: 'report: passed' },
    ]);

    expect(gate.contexts[0]).toMatchObject({
      worktreePath: '/repo/.worktrees/FG-1',
      baseSha: 'base-sha-1',
      claims: [{ kind: 'edited', path: 'src/a.ts' }],
    });
  });

  it('verifies in the same tick that settles the run', async () => {
    const { rig } = await makeVerifyRig();
    const id = await startAndFinish(rig);
    await rig.tick();
    expect((await rig.ticket(id)).status).toBe('done');
  });

  it('keeps a failed cleanup from blocking done', async () => {
    const { rig, host } = await makeVerifyRig();
    host.failNext('deleteBranch', new Error('gone'));
    const id = await startAndFinish(rig);
    await rig.tick();
    expect((await rig.ticket(id)).status).toBe('done');
    expect(rig.logs.some((l) => l.message.includes('could not delete branch'))).toBe(
      true,
    );
  });

  it('leaves tickets in verifying when the project has no git host', async () => {
    const { rig } = await makeVerifyRig();
    const id = await startAndFinish(rig);
    rig.runtime.current = { ...rig.runtime.current!, gitHost: null };
    await rig.tick();
    expect((await rig.ticket(id)).status).toBe('verifying');
  });
});

describe('verify: tiers', () => {
  it('stops tier B in review without merging', async () => {
    const { rig, host } = await makeVerifyRig({ tier: 'B' });
    const id = await startAndFinish(rig);
    const report = await rig.tick();
    expect(report.verified[0]?.outcome).toBe('review');
    expect(await rig.ticket(id)).toMatchObject({ status: 'review', tier_actual: 'B' });
    expect(host.count('merge')).toBe(0);
    expect(host.count('openPr')).toBe(1);
  });

  it('raises tier A to C when the diff touches a tier-C glob', async () => {
    const { rig, host } = await makeVerifyRig({ tier: 'A' });
    rig.worktrees.changed = ['src/auth/login.ts'];
    const id = await startAndFinish(rig);
    const report = await rig.tick();
    expect(report.verified[0]?.outcome).toBe('needs_signoff');
    expect(await rig.ticket(id)).toMatchObject({
      status: 'needs_signoff',
      tier_actual: 'C',
    });

    expect(host.count('merge')).toBe(0);
  });
});

describe('verify: failed gates', () => {
  it('reworks with the findings in the next prompt, then merges on the second pass', async () => {
    const { rig, host, gate } = await makeVerifyRig();
    gate.script(
      verdict('failed', [
        {
          check: 'claims',
          message: 'claimed edit of src/x.ts not in diff',
          claim: { kind: 'edited', path: 'src/x.ts' },
        },
      ]),
      verdict('passed'),
    );

    const id = await startAndFinish(rig);
    const first = await rig.tick();

    expect(first.verified[0]).toMatchObject({ outcome: 'rework' });
    expect(first.dispatched).toEqual([{ ticketId: id, runId: 'run-2', kind: 'retry' }]);
    expect(await rig.ticket(id)).toMatchObject({
      status: 'in_progress',
      rework_count: 1,
    });

    const prompts = rig.llm.callsTo('dispatch_prompt');
    expect(JSON.stringify(prompts.at(-1)?.input)).toContain('claimed edit of src/x.ts');
    expect(JSON.stringify(prompts.at(-1)?.input)).toContain('"kind":"rework"');
    const run2 = await rig.storage.transaction((tx) => tx.runs.get('run-2'));
    expect(run2?.retry_of).toBe('run-1');

    await finishRun(rig, 'run-2');
    const second = await rig.tick();

    expect(second.verified[0]).toMatchObject({ runId: 'run-2', outcome: 'merged' });
    expect((await rig.ticket(id)).status).toBe('done');
    expect(host.count('openPr')).toBe(1);
    expect(host.count('push')).toBe(2);
    expect(host.count('merge')).toBe(1);
    expect(await gateRows(rig, id)).toHaveLength(2);
  });

  it('parks at the rework cap with a reason naming the gate', async () => {
    const { rig, host, gate } = await makeVerifyRig();
    gate.script(verdict('failed', [{ check: 'claims', message: 'bad claim' }]));
    const id = await startAndFinish(rig);
    await drive(rig, 8, async () => (await rig.ticket(id)).status === 'waiting_human');

    const t = await rig.ticket(id);
    expect(t.status).toBe('waiting_human');
    expect(t.blocked_reason).toContain('G1');
    expect(t.blocked_reason).toContain('bad claim');
    expect(t.rework_count).toBe(2);
    expect(host.count('merge')).toBe(0);
    expect(rig.driver.starts).toHaveLength(3);
  });
});
