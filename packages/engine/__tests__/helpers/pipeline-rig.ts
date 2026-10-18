/**
 * Pipeline rig: a verify rig whose ticket runs the Standard lane, with a scripted script runner.
 *
 * Why: every pipeline scenario starts the same way (a request triaged into the Standard lane, a
 *   host and a G1 gate that pass) and then plays the stages by hand: the test-writer finishes, the
 *   implementer finishes with a distinctive narrative, the reviewer submits a review. These helpers
 *   build that start and the three plays, so each scenario shows only what differs: the findings,
 *   the tier, the policy, the restart.
 *
 * Exports: IMPLEMENT, G1, MERGE, FakeScriptRunner, createFakeScriptRunner(), PipelineRig, makePipelineRig(), setProjectPipelines(),
 *   writerDone(), reviewDone(), review(), runIds(), stageRows(), agentOf().
 * Depends on: helpers/verify-rig, helpers/fake-git-host, helpers/scripted-driver, @forge/core. No IO.
 */

import type {
  GateVerdict,
  ReviewSubmission,
  ScriptGateRequest,
  ScriptGateRunner,
  StageRun,
} from '@forge/core';
import { verdict } from '#tests/helpers/fake-git-host.js';
import type { Rig } from '#tests/helpers/rig.js';
import { makeResult } from '#tests/helpers/scripted-driver.js';
import { makeVerifyRig } from '#tests/helpers/verify-rig.js';
import type { VerifyRig } from '#tests/helpers/verify-rig.js';

/** Stage definitions the pipeline scenarios assemble their own lists from. */
export const IMPLEMENT = {
  id: 'implementer',
  kind: 'agent',
  label: 'Implement',
  agent: 'implementer',
};
export const G1 = {
  id: 'g1',
  kind: 'script_gate',
  label: 'Gate G1',
  run: { builtin: 'g1' },
};
export const MERGE = { id: 'merge', kind: 'merge', label: 'Merge', locked: true };

export interface FakeScriptRunner extends ScriptGateRunner {
  readonly requests: ScriptGateRequest[];
  /** Verdicts (or errors to throw) consumed one per run; the last repeats. Default: passed. */
  script(...answers: (GateVerdict | Error)[]): void;
}

export function createFakeScriptRunner(): FakeScriptRunner {
  const requests: ScriptGateRequest[] = [];
  let answers: (GateVerdict | Error)[] = [verdict('passed')];

  return {
    requests,
    script(...next) {
      answers = next;
    },
    async run(req) {
      requests.push(req);
      const a = answers.length > 1 ? answers.shift()! : answers[0]!;
      if (a instanceof Error) {
        throw a;
      }

      return a;
    },
  };
}

export interface PipelineRig extends VerifyRig {
  readonly scripts: FakeScriptRunner;
}

/** A verify rig whose triage chooses `lane` (Standard by default) at `tier`, with a script runner on the runtime. */
export async function makePipelineRig(
  opts: {
    lane?: 'express' | 'standard' | 'full';
    tier?: 'A' | 'B' | 'C';
    /** Company engine settings for the rig, e.g. `{ max_concurrent_per_project: 2 }`. */
    engine?: Record<string, unknown>;
  } = {},
): Promise<PipelineRig> {
  const v = await makeVerifyRig(opts.engine ? { engine: opts.engine } : {});
  const scripts = createFakeScriptRunner();
  v.rig.runtime.current = {
    ...v.rig.runtime.current!,
    scriptGates: scripts,
  };

  v.rig.llm.script('triage', {
    lane: opts.lane ?? 'standard',
    confidence: 0.95,
    predicted_files: ['src/a.ts'],
    questions: [],
    type: 'fix',
    tier_predicted: opts.tier ?? 'A',
    title: 'Scripted triage title',
  });

  return { ...v, scripts };
}

/** Saves `pipelines` (lane lists and routing rules) as the project's own settings, the way the settings door would. */
export async function setProjectPipelines(
  rig: Rig,
  pipelines: Record<string, unknown>,
): Promise<void> {
  const current = await rig.config.project('forge');
  await rig.config.append({
    scope: 'project',
    project: 'forge',
    doc: { pipelines },
    author: 'test',
    reason: 'pipeline scenario',
    expectedVersion: current.version.project,
  });
}

/** The Worker of `runId` finishes with `claims` and `summary` (its own narrative) and the run succeeds. */
export async function writerDone(
  rig: Rig,
  runId: string,
  claims: readonly unknown[] = [],
  summary = 'done',
): Promise<void> {
  rig.driver.emit(runId, { type: 'finish', summary, structured: { claims } });
  rig.driver.finish(runId, makeResult());
  await rig.flush();
}

/** The check agent of `runId` submits `submission` (stored the way the MCP tool stores it) and the run succeeds. */
export async function reviewDone(
  rig: Rig,
  runId: string,
  submission: ReviewSubmission | null,
): Promise<void> {
  if (submission) {
    await rig.storage.transaction((tx) =>
      tx.runEvents.append(runId, {
        type: 'review',
        ts: new Date(rig.clock.now()).toISOString(),
        review: submission,
      }),
    );
  }

  rig.driver.finish(runId, makeResult());
  await rig.flush();
}

/** A submitted review. */
export const review = (
  verdictOf: ReviewSubmission['verdict'],
  findings: ReviewSubmission['findings'] = [],
  summary = 'reviewed',
): ReviewSubmission => ({ verdict: verdictOf, summary, findings });

/** Every run id the harness was started with, in order. */
export const runIds = (rig: Rig): string[] => rig.driver.starts.map((s) => s.runId);

export const stageRows = (rig: Rig, ticketId: string): Promise<StageRun[]> =>
  rig.storage.transaction((tx) => tx.stageRuns.listByTicket(ticketId));

/** The agent id recorded on run `runId`. */
export async function agentOf(rig: Rig, runId: string): Promise<string | undefined> {
  return (await rig.storage.transaction((tx) => tx.runs.get(runId)))?.agent_id;
}
