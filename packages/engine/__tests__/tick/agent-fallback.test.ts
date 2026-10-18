/**
 * Pins the second step of the ladder: the agent's own list of places to run (d-0080).
 *
 * Why: a rate limit past its retries, or a model the harness cannot serve, says nothing about the work, and parking the
 *   ticket for a person at once would waste the owner's list of other places to run. The engine moves the stage to the
 *   next usable entry of the agent's list (same-harness models count, a parked or uninstalled harness is skipped, a
 *   critic never lands on the Worker's own model family once two are connected, d-0073), and records what really ran
 *   on the run row and on the stage row.
 *
 * Pins: Done-when 7 (rate_limit past max_attempts moves to slot 1 with slot 1's model on the same harness;
 *   model_unavailable moves at once; run rows carry `model` and `fallback_slot`; a parked harness is skipped; a critic
 *   never lands on the Worker's family with two families connected).
 * Depends on: helpers/fallback-rig, helpers/rig, helpers/pipeline-rig, @forge/core, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  RETRY,
  fail,
  failRun,
  model,
  rows,
  run,
  runsOn,
  setProject,
} from '#tests/helpers/fallback-rig.js';
import {
  G1,
  IMPLEMENT,
  MERGE,
  makePipelineRig,
  writerDone,
} from '#tests/helpers/pipeline-rig.js';
import { makeRig } from '#tests/helpers/rig.js';

describe('the fallback list', () => {
  it("moves to the next entry after the retries of one place are spent, on the same harness, with that entry's model", async () => {
    const rig = await makeRig({ engine: { retry: RETRY } });
    await setProject(
      rig,
      runsOn([{ harness: 'project_default', model: model('sonnet') }]),
    );

    const id = await rig.request('Fix it');
    await rig.tick();

    expect(rig.driver.starts[0]?.model).toBe('opus');
    await failRun(rig, 'run-1', 'rate_limit');
    rig.clock.advance(2_000);
    await rig.tick();

    // The primary got its one retry (attempts 1 of 1), still on opus.
    expect(rig.driver.starts[1]?.model).toBe('opus');
    await failRun(rig, 'run-2', 'rate_limit');
    await rig.tick();

    expect(rig.driver.starts).toHaveLength(3);
    expect(rig.driver.starts[2]?.model).toBe('sonnet');
    expect(
      await Promise.all(['run-1', 'run-2', 'run-3'].map((r) => run(rig, r))),
    ).toMatchObject([
      { model: 'opus', fallback_slot: 0 },
      { model: 'opus', fallback_slot: 0 },
      { model: 'sonnet', fallback_slot: 1, harness: 'scripted' },
    ]);

    expect((await rows(rig, id))[0]?.outcome.fallback).toMatchObject({
      slot: 1,
      tried: [{ slot: 0, harness: 'scripted', model: 'opus', family: 'claude' }],
    });

    expect((await rig.ticket(id)).status).toBe('in_progress');
  });

  it('moves at once for a model the harness cannot serve, never retrying the same model', async () => {
    const rig = await makeRig({ engine: { retry: RETRY } });
    await setProject(
      rig,
      runsOn([{ harness: 'project_default', model: model('sonnet') }]),
    );

    await rig.request('Fix it');
    await rig.tick();

    await failRun(rig, 'run-1', 'model_unavailable');
    await rig.tick();

    expect(rig.driver.starts.map((s) => s.model)).toEqual(['opus', 'sonnet']);
    expect((await run(rig, 'run-1'))?.error_family).toBe('model_unavailable');
  });

  it('skips a parked harness and one that is not installed', async () => {
    const rig = await makeRig({ engine: { retry: RETRY } });
    rig.harnesses.add('codex');
    await setProject(
      rig,
      runsOn([
        { harness: 'codex', model: model('gpt-5') },
        { harness: 'ghost-harness', model: model('x') },
        { harness: 'project_default', model: model('haiku') },
      ]),
    );

    await rig.storage.transaction((tx) =>
      tx.harnessState.upsert({
        harness_id: 'codex',
        paused_until: new Date(rig.clock.now() + 3_600_000).toISOString(),
        reason: 'out of quota',
        updated_at: new Date(rig.clock.now()).toISOString(),
      }),
    );

    await rig.request('Fix it');
    await rig.tick();
    await failRun(rig, 'run-1', 'model_unavailable');
    await rig.tick();

    expect(rig.driver.starts.map((s) => s.model)).toEqual(['opus', 'haiku']);
    expect((await run(rig, 'run-2'))?.fallback_slot).toBe(3);
  });

  it("keeps a critic off the Worker's model family once two families are connected", async () => {
    const v = await makePipelineRig({ tier: 'A', engine: { retry: RETRY } });
    const { rig } = v;
    rig.driver.driver.models = async () => [
      {
        id: 'opus',
        label: 'Opus',
        speed: 'deep',
        cost: 'high',
        recommended_for: ['writer'],
      },
      {
        id: 'gpt-5',
        label: 'GPT',
        speed: 'balanced',
        cost: 'high',
        recommended_for: ['reviewer'],
      },
    ];

    // One save holds both the critic's chain and the pipeline that names it (a save is the whole project document).
    const current = await rig.config.project('forge');
    await rig.config.append({
      scope: 'project',
      project: 'forge',
      doc: {
        ecosystems: ['node'],
        default_harness: 'scripted',
        checks: [{ name: 'test', role: 'test', command: 'pnpm test' }],
        agents: {
          overrides: {
            critic: {
              runs_on: {
                harness: 'project_default',
                model: model('gpt-5'),
                fallbacks: [
                  { harness: 'project_default', model: model('opus') },
                  { harness: 'project_default', model: model('gpt-5-mini') },
                ],
              },
            },
          },
        },
        pipelines: {
          standard: {
            stages: [
              IMPLEMENT,
              G1,
              { id: 'critique', kind: 'agent', label: 'Critic', agent: 'critic' },
              MERGE,
            ],
          },
        },
      } as never,
      author: 'test',
      reason: 'critic chain',
      expectedVersion: current.version.project,
    });

    await rig.request('Fix it');
    await rig.tick();
    await writerDone(rig, 'run-1', [{ kind: 'edited', path: 'src/a.ts' }]);
    await rig.tick();

    expect(rig.driver.starts[1]?.model).toBe('gpt-5');
    rig.driver.finish('run-2', fail('model_unavailable'));
    await rig.flush();
    await rig.tick();
    await rig.tick();

    // Slot 1 is the Worker's own family (claude): skipped; slot 2 is another family.
    expect(rig.driver.starts[2]?.model).toBe('gpt-5-mini');
    expect((await run(rig, 'run-3'))?.fallback_slot).toBe(2);
  });
});
