/**
 * Pins the stages beyond a lone reviewer: the owner's human stage and script gates.
 *
 * Why: these are what an owner composes a pipeline from (d-0152). A human stage must hold even a
 *   tier A change for the owner; a script gate is the owner's own command and must stop the merge
 *   the way G1 does and never be trusted when it cannot run. Each ends at the same merge door as
 *   every other stage, so none of them can ship work that a stage stopped. Groups and routing rules
 *   are in pipeline-groups-routing.test.ts.
 *
 * Pins: Done-when 7 (tier A with a human stage goes to review and approve ends done with the human
 *   row passed), Done-when 8 (a failing script gate reworks; a gate that cannot run parks the ticket;
 *   the runner is asked with the guard paths).
 * Depends on: helpers/pipeline-rig, vitest.
 */

import { describe, expect, it } from 'vitest';
import { verdict } from '#tests/helpers/fake-git-host.js';
import type { Rig } from '#tests/helpers/rig.js';
import {
  G1,
  IMPLEMENT,
  MERGE,
  agentOf,
  makePipelineRig,
  runIds,
  setProjectPipelines,
  stageRows,
  writerDone,
} from '#tests/helpers/pipeline-rig.js';

const SCRIPT = {
  id: 'lint-sec',
  kind: 'script_gate',
  label: 'Security scan',
  run: {
    command: 'node scripts/scan.mjs',
    timeout_ms: 60_000,
    guard_paths: ['scripts/**'],
  },
};

describe('human stage', () => {
  it('holds a tier A change for the owner, and approving merges and passes the stage', async () => {
    const v = await makePipelineRig({ tier: 'A' });
    const { rig, host } = v;
    await setProjectPipelines(rig, {
      standard: {
        stages: [
          IMPLEMENT,
          G1,
          { id: 'human', kind: 'human', label: 'Your sign-off', prompt: 'Look at it.' },
          MERGE,
        ],
      },
    });

    const id = await rig.request('Fix the doctor check');
    await rig.tick();
    await writerDone(rig, 'run-1', [{ kind: 'edited', path: 'src/a.ts' }]);
    await rig.tick();

    expect(await rig.ticket(id)).toMatchObject({ status: 'review', tier_actual: 'A' });
    expect(host.count('merge')).toBe(0);
    expect((await stageRows(rig, id)).find((r) => r.stage_id === 'human')?.status).toBe(
      'waiting',
    );

    const out = await rig.engine.actOnTicket(id, { action: 'approve' }, 'owner');

    expect(out).toEqual({ status: 'done', interaction: null });
    expect(host.count('merge')).toBe(1);
    const rows = await stageRows(rig, id);
    expect(rows.find((r) => r.stage_id === 'human')?.status).toBe('passed');
  });

  it('sends the work back to the writer when the owner reworks it, and runs the checks again after', async () => {
    const v = await makePipelineRig({ tier: 'A' });
    const { rig } = v;
    await setProjectPipelines(rig, {
      standard: {
        stages: [
          IMPLEMENT,
          G1,
          { id: 'human', kind: 'human', label: 'Your sign-off', prompt: 'Look at it.' },
          MERGE,
        ],
      },
    });

    const id = await rig.request('Fix the doctor check');
    await rig.tick();
    await writerDone(rig, 'run-1', [{ kind: 'edited', path: 'src/a.ts' }]);
    await rig.tick();
    await rig.engine.actOnTicket(
      id,
      { action: 'rework', comment: 'Please rename the helper' },
      'owner',
    );

    await rig.tick();

    expect(await rig.ticket(id)).toMatchObject({ status: 'in_progress' });
    expect(runIds(rig)).toEqual(['run-1', 'run-2']);
    expect(await agentOf(rig, 'run-2')).toBe('implementer');
    const rows = await stageRows(rig, id);

    expect(rows.find((r) => r.stage_id === 'human' && r.cycle === 0)?.status).toBe(
      'failed',
    );

    expect(rows.find((r) => r.stage_id === 'implementer' && r.cycle === 1)?.status).toBe(
      'running',
    );
  });
});

/** The tick that gates the work and starts the script, then the tick that applies the script's result. */
async function settleScript(rig: Rig): Promise<void> {
  await rig.tick();
  await rig.tick();
}

describe('script gate', () => {
  async function withScript(tier: 'A' | 'B' = 'A') {
    const v = await makePipelineRig({ tier });
    await setProjectPipelines(v.rig, {
      standard: { stages: [IMPLEMENT, G1, SCRIPT, MERGE] },
    });

    const id = await v.rig.request('Fix the doctor check');
    await v.rig.tick();
    await writerDone(v.rig, 'run-1', [{ kind: 'edited', path: 'src/a.ts' }]);

    return { ...v, id };
  }

  it('runs the owner command with its guard paths and merges when it passes', async () => {
    const { rig, scripts, host, id } = await withScript();

    await settleScript(rig);

    expect(scripts.requests).toHaveLength(1);
    expect(scripts.requests[0]).toMatchObject({
      command: 'node scripts/scan.mjs',
      guardPaths: ['scripts/**'],
      timeoutMs: 60_000,
      expect: 'pass',
    });

    expect(await rig.ticket(id)).toMatchObject({ status: 'done' });
    expect(host.count('merge')).toBe(1);
    expect(
      (await stageRows(rig, id)).find((r) => r.stage_id === 'lint-sec')?.status,
    ).toBe('passed');
  });

  it('sends the work back with the output when the command fails (exit 1)', async () => {
    const { rig, scripts, host, id } = await withScript();
    scripts.script(
      {
        status: 'failed',
        findings: [{ check: 'script', message: 'found a hard-coded key in src/a.ts' }],
        report: 'exit code 1',
      },
      verdict('passed'),
    );

    await settleScript(rig);

    expect(await rig.ticket(id)).toMatchObject({
      status: 'in_progress',
      rework_count: 1,
    });

    expect(host.count('merge')).toBe(0);
    expect(JSON.stringify(rig.llm.callsTo('dispatch_prompt').at(-1)?.input)).toContain(
      'hard-coded key',
    );

    const failed = (await stageRows(rig, id)).find((r) => r.stage_id === 'lint-sec');
    expect(failed).toMatchObject({ status: 'failed', cycle: 0 });
  });

  it('parks the ticket and never merges when the command cannot run', async () => {
    const { rig, scripts, host, id } = await withScript();
    scripts.script(new Error('spawn ENOENT'));

    await settleScript(rig);

    const t = await rig.ticket(id);
    expect(t).toMatchObject({ status: 'waiting_human', parked_from: 'verifying' });
    expect(t.blocked_reason).toContain('could not run');
    expect(host.count('merge')).toBe(0);
    expect(
      (await stageRows(rig, id)).find((r) => r.stage_id === 'lint-sec')?.status,
    ).toBe('error');
  });

  it('fails closed when the server has no script runner', async () => {
    const { rig, host, id } = await withScript();
    rig.runtime.current = { ...rig.runtime.current!, scriptGates: undefined as never };
    delete (rig.runtime.current as { scriptGates?: unknown }).scriptGates;

    await rig.tick();

    const t = await rig.ticket(id);
    expect(t.status).toBe('waiting_human');
    expect(t.blocked_reason).toContain('no script gate runner');
    expect(host.count('merge')).toBe(0);
  });
});
