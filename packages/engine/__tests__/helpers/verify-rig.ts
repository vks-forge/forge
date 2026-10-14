/**
 * Verify rig: the engine rig plus a recording git host and a scripted gate.
 *
 * Why: every verify scenario starts the same way: a request becomes a ticket, a Worker run
 *   finishes with some claims, and the next tick publishes and judges it. These helpers
 *   build that start in two calls so each scenario shows only what differs: the gate
 *   verdicts, the host failures, the tier.
 *
 * Exports: VerifyRig, makeVerifyRig(), startAndFinish(), finishRun(), drive().
 * Depends on: helpers/rig, helpers/fake-git-host, helpers/scripted-driver, @forge/core. No IO.
 */

import { ProjectConfig } from '@forge/core';
import type { Claim } from '@forge/core';
import type { ProjectRuntime } from '#/types/verify.types.js';
import { createFakeGitHost, createScriptedGate } from '#tests/helpers/fake-git-host.js';
import type { FakeGitHost, ScriptedGate } from '#tests/helpers/fake-git-host.js';
import { makeRig } from '#tests/helpers/rig.js';
import type { Rig, RigOptions } from '#tests/helpers/rig.js';
import { makeResult } from '#tests/helpers/scripted-driver.js';

export interface VerifyRig {
  readonly rig: Rig;
  readonly host: FakeGitHost;
  readonly gate: ScriptedGate;
}

export async function makeVerifyRig(
  opts: RigOptions & { tier?: 'A' | 'B' | 'C' } = {},
): Promise<VerifyRig> {
  const rig = await makeRig(opts);
  const host = createFakeGitHost();
  const gate = createScriptedGate('G1');
  // The engine takes project settings from the config source, so the ts profile and test
  // command and the Tier C paths live there, not only on the runtime.
  await rig.config.append({
    scope: 'project',
    project: 'forge',
    doc: {
      profile: 'ts',
      default_harness: 'scripted',
      commands: { test: 'pnpm test' },
      tier_c_globs: ['**/auth/**'],
    },
    author: 'test',
    reason: 'verify rig project settings',
    expectedVersion: 0,
  });

  rig.runtime.current = {
    ...(rig.runtime.current as ProjectRuntime),
    config: ProjectConfig.parse({
      slug: 'forge',
      prefix: 'FG',
      profile: 'ts',
      default_harness: 'scripted',
      commands: { test: 'pnpm test' },
    }),
    gitHost: host,
    gates: [gate],
  };

  if (opts.tier) {
    rig.llm.script('triage', {
      lane: 'express',
      confidence: 0.9,
      predicted_files: ['src/a.ts'],
      questions: [],
      type: 'fix',
      tier_predicted: opts.tier,
      title: 'Scripted triage title',
    });
  }

  return { rig, host, gate };
}

/** The Worker of `runId` calls `finish` with `claims` and the run ends in success. */
export async function finishRun(
  rig: Rig,
  runId: string,
  claims: readonly unknown[] = [],
): Promise<void> {
  rig.driver.emit(runId, {
    type: 'finish',
    summary: 'done',
    structured: { claims },
  });

  rig.driver.finish(runId, makeResult());
  await rig.flush();
}

/** Request, dispatch, the Worker finishes run-1; returns the ticket id (the next tick verifies). */
export async function startAndFinish(
  rig: Rig,
  claims: readonly Claim[] = [],
): Promise<string> {
  const id = await rig.request('Fix the doctor check');
  await rig.tick();
  await finishRun(rig, 'run-1', claims);

  return id;
}

/** Ticks until `stop()` or `max` ticks; live runs finish successfully and the clock moves 61 s each round. */
export async function drive(
  rig: Rig,
  max: number,
  stop: () => Promise<boolean>,
): Promise<void> {
  for (let i = 0; i < max; i++) {
    for (const id of rig.engine.liveRunIds()) {
      await finishRun(rig, id);
    }

    await rig.tick();
    if (await stop()) {
      return;
    }

    rig.clock.advance(61_000);
  }
}
