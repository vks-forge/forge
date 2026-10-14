/**
 * Scenario: a merge rests on the exact commit the gates judged, in the project's own base.
 *
 * Why: gates take minutes and verdicts are about one commit. If a push landed after the
 *   gates passed and the engine merged the PR anyway, unchecked code would ship on a green
 *   verdict. If a host answered "not computed yet" and the engine merged blind, or refused
 *   for a transient reason and the ticket was parked for a human, the factory would either
 *   ship wrongly or stall on faults it should absorb. If the worktree, the diff and the PR
 *   did not share one base branch, tiers would be computed on the wrong diff. And a Worker
 *   that does not know G1 wants typed claims for every edit wastes a rework run. Each case
 *   pins one of those promises.
 *
 * Pins: head moved after the gates -> no merge and the gates run again; head moved between
 *   status and merge -> same, not a park; legacy rows without a sha are not trusted; a
 *   branch that never settles parks after a few re-gates; `mergeable: null` waits;
 *   a rate-limited merge retries; passing rows of an older run never merge a newer run;
 *   one base branch for worktree, diff and PR; a runtime for another project is refused.
 * Depends on: helpers/verify-rig, helpers/fake-git-host, @forge/core, vitest.
 */

import { HeadMovedError, ProjectConfig, RateLimitError } from '@forge/core';
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

describe('verify: merge pinned to the gated commit', () => {
  it('does not merge when the branch moved after the gates passed, and gates the new head', async () => {
    const { rig, host, gate } = await makeVerifyRig();
    const id = await startAndFinish(rig);
    // The gates see head-sha-1; before the next tick applies them, a push moves the branch.
    await rig.engine.tick();
    await rig.flush();
    host.headSha = 'moved-sha';
    rig.worktrees.headSha = 'moved-sha';

    await rig.tickOn(rig.engine);

    expect(gate.contexts).toHaveLength(2);
    const t = await rig.ticket(id);
    expect(t.status).toBe('done');
    expect(host.mergeShas).toEqual(['moved-sha']);
    expect((await gateRows(rig, id)).map((r) => r.head_sha)).toEqual([
      'head-sha-1',
      'moved-sha',
    ]);
  });

  it('gates the new head instead of parking when the host reports the head moved at merge time', async () => {
    const { rig, host, gate } = await makeVerifyRig();
    host.failNext('merge', new HeadMovedError('head moved'));
    const id = await startAndFinish(rig);

    const report = await rig.tick();
    expect(report.verified.map((v) => v.outcome)).not.toContain('parked');
    await rig.tick();

    expect((await rig.ticket(id)).status).toBe('done');
    expect(gate.contexts).toHaveLength(2);
    expect(host.count('merge')).toBe(2);
    expect(host.mergeShas).toEqual(['head-sha-1', 'head-sha-1']);
  });

  it('never trusts a pass whose rows carry no sha (written before shas were recorded)', async () => {
    const { rig, host, gate } = await makeVerifyRig();
    const id = await startAndFinish(rig);
    await rig.storage.transaction((tx) =>
      tx.gateResults.insert({
        run_id: 'run-1',
        gate: 'G1',
        status: 'passed',
        started_at: new Date(rig.clock.now()).toISOString(),
      }),
    );

    await rig.tick();

    expect(gate.contexts).toHaveLength(1);
    expect(host.mergeShas).toEqual(['head-sha-1']);
    expect((await rig.ticket(id)).status).toBe('done');
  });

  it('parks, naming the moving branch, when the head never settles', async () => {
    const { rig, host, gate } = await makeVerifyRig();
    host.headSha = 'somebody-else';
    const id = await startAndFinish(rig);

    await drive(rig, 10, async () => (await rig.ticket(id)).status === 'waiting_human');

    const t = await rig.ticket(id);
    expect(t.status).toBe('waiting_human');
    expect(t.blocked_reason).toContain('moved');
    expect(host.count('merge')).toBe(0);
    expect(gate.contexts.length).toBeLessThanOrEqual(5);
  });

  it('refuses to merge a newer run on the strength of an older run passing rows', async () => {
    const { rig, host, gate } = await makeVerifyRig();
    gate.script(
      verdict('failed', [{ check: 'claims', message: 'bad claim' }]),
      verdict('error'),
    );

    const id = await startAndFinish(rig);
    await rig.tick();
    expect((await rig.ticket(id)).status).toBe('in_progress');
    await rig.storage.transaction((tx) =>
      tx.gateResults.insert({
        run_id: 'run-1',
        gate: 'G1',
        status: 'passed',
        head_sha: 'head-sha-1',
        started_at: new Date(rig.clock.now()).toISOString(),
      }),
    );

    await finishRun(rig, 'run-2');
    const report = await rig.tick();

    expect(report.verified[0]).toMatchObject({
      runId: 'run-2',
      outcome: 'retry_scheduled',
    });

    expect(host.count('merge')).toBe(0);
    expect((await rig.ticket(id)).status).toBe('verifying');
  });
});

describe('verify: transient merge conditions', () => {
  it('waits while the host has not computed mergeability, then merges', async () => {
    const { rig, host } = await makeVerifyRig();
    host.mergeable = null;
    const id = await startAndFinish(rig);

    const first = await rig.tick();
    expect(first.verified[0]).toMatchObject({
      outcome: 'retry_scheduled',
      errorFamily: 'rate_limit',
    });

    expect(host.count('merge')).toBe(0);
    expect((await rig.ticket(id)).status).toBe('verifying');

    host.mergeable = true;
    rig.clock.advance(61_000);
    await rig.tick();

    expect((await rig.ticket(id)).status).toBe('done');
    expect(host.count('merge')).toBe(1);
  });

  it('retries a merge the host refused only because a branch was just modified', async () => {
    const { rig, host } = await makeVerifyRig();
    host.failNext('merge', new RateLimitError('base branch was modified'));
    const id = await startAndFinish(rig);

    const first = await rig.tick();
    expect(first.verified[0]).toMatchObject({ outcome: 'retry_scheduled' });
    expect((await rig.ticket(id)).status).toBe('verifying');

    rig.clock.advance(61_000);
    await rig.tick();
    expect((await rig.ticket(id)).status).toBe('done');
  });
});

describe('verify: one base branch', () => {
  const developRuntime = (rig: Rig) => {
    rig.runtime.current = {
      ...rig.runtime.current!,
      config: ProjectConfig.parse({
        slug: 'forge',
        prefix: 'FG',
        profile: 'ts',
        default_harness: 'scripted',
        git_host: { kind: 'local', remote_path: '/remote.git', base_branch: 'develop' },
      }),
    };
  };

  it("cuts the worktree, diffs and opens the PR against the project's base branch", async () => {
    const { rig, host } = await makeVerifyRig();
    developRuntime(rig);

    await startAndFinish(rig);
    await rig.tick();

    expect(rig.worktrees.created.map((c) => c.baseRef)).toEqual(['develop']);
    expect(host.opened.map((o) => o.base)).toEqual(['develop']);
  });

  it('falls back to the engine default only for a project without a git host', async () => {
    const { rig, host } = await makeVerifyRig();

    await startAndFinish(rig);
    await rig.tick();

    expect(rig.worktrees.created.map((c) => c.baseRef)).toEqual(['main']);
    expect(host.opened.map((o) => o.base)).toEqual(['main']);
  });

  it('refuses a runtime built for another project and publishes nothing', async () => {
    const { rig, host } = await makeVerifyRig();
    const id = await startAndFinish(rig);
    rig.runtime.current = {
      ...rig.runtime.current!,
      config: ProjectConfig.parse({
        slug: 'other',
        prefix: 'OT',
        profile: 'ts',
        default_harness: 'scripted',
      }),
    };

    const report = await rig.tick();

    expect(report.errors.map((e) => e.message).join()).toContain(
      'configured for project other',
    );

    expect((await rig.ticket(id)).status).toBe('verifying');
    expect(host.count('push')).toBe(0);
  });

  it('does not dispatch with a runtime built for another project', async () => {
    const { rig } = await makeVerifyRig();
    rig.runtime.current = {
      ...rig.runtime.current!,
      config: ProjectConfig.parse({
        slug: 'other',
        prefix: 'OT',
        profile: 'ts',
        default_harness: 'scripted',
      }),
    };

    await rig.request('Fix it');
    const report = await rig.tick();

    expect(report.dispatched).toEqual([]);
    expect(report.errors.map((e) => e.message).join()).toContain(
      'configured for project other',
    );

    expect(rig.worktrees.created).toEqual([]);
  });
});
