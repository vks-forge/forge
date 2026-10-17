/**
 * Script gates in a pipeline: start the owner's command, apply its verdict to the stage.
 *
 * Why: a script gate is the owner's own check as a stage (d-0074): exit 0 passes, anything else
 *   stops the merge the same way a failed G1 does (send the Worker back with the output, bounded
 *   by the rework cap), or holds the ticket for the owner when the stage says so. The command runs
 *   on the worktree after the Worker finished, by a runner the Worker does not control, and a
 *   diff that touched the script or its guarded paths fails closed before the command is run. A
 *   gate that cannot run at all (no runner on this server, the command will not start) is an
 *   error that parks the ticket, never a pass. The job runs beside the tick (tick/stage-script-jobs);
 *   a tick that finds its result writes the row and acts on it.
 *
 * Exports: startScriptMember(), applyFinishedGates().
 * Depends on: @forge/core (stage types), tick/{stage-artifacts,stage-labels,stage-records,stage-script-jobs,
 *   stage-send-back,verify-outcomes}, types/stage-runner. IO: the script runner and the report store.
 */

import type { CheckMember, ScriptGateStage, Stage, StageRun } from '@forge/core';
import {
  makeDraft,
  persistArtifacts,
  pipelineHasChecks,
} from '#/tick/stage-artifacts.js';
import { labelOf, policyOf } from '#/tick/stage-labels.js';
import { beginStageRun, finishStageRun } from '#/tick/stage-records.js';
import {
  hasJob,
  startScriptJob,
  stageJobKey,
  takeFinishedJob,
} from '#/tick/stage-script-jobs.js';
import { holdForOwnerTx, sendBackTx } from '#/tick/stage-send-back.js';
import { parkVerifying } from '#/tick/verify-outcomes.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type {
  CustomScriptRun,
  StageJobOutcome,
  StageState,
} from '#/types/stage-runner.types.js';
import type { VerifyTarget } from '#/types/verify.types.js';

/** The script members of `stage` (a lone script gate is its own member, with an empty id). */
function scriptMembers(
  stage: Stage,
): { id: string; def: ScriptGateStage; run: CustomScriptRun }[] {
  const defs =
    stage.kind === 'group'
      ? stage.members.map((m) => ({ id: m.id, def: m }))
      : [{ id: '', def: stage }];

  return defs.flatMap(({ id, def }) =>
    def.kind === 'script_gate' && 'command' in def.run ? [{ id, def, run: def.run }] : [],
  );
}

/** Starts the script `member` of `stage` in the background (or takes over a running row after a restart). */
export async function startScriptMember(
  ctx: EngineCtx,
  t: VerifyTarget,
  state: StageState,
  stage: Stage,
  member: CheckMember,
): Promise<void> {
  const found = scriptMembers(stage).find((m) => m.id === member.id);
  if (!found) {
    return;
  }

  const runner = t.runtime.scriptGates;
  if (!runner) {
    await parkVerifying(
      ctx,
      t,
      `${found.def.label}: this server has no script gate runner, so the gate cannot run; needs you`,
    );

    return;
  }

  const key = stageJobKey(t.ticket.id, t.run.id, stage.id, member.id);
  if (hasJob(ctx, key)) {
    return;
  }

  const rowId = await ctx.deps.storage.transaction((tx) =>
    beginStageRun(tx, ctx.nowIso, {
      ticket_id: t.ticket.id,
      stage_id: stage.id,
      member_id: member.id,
      cycle: state.cycle,
      kind: 'script_gate',
      run_id: t.run.id,
    }),
  );

  if (rowId === null) {
    return;
  }

  const { run } = found;
  startScriptJob(
    ctx,
    key,
    { ticketId: t.ticket.id, stageRunId: rowId, purpose: 'gate' },
    () =>
      runner.run({
        worktreePath: t.worktree,
        baseSha: t.baseSha,
        command: run.command,
        ...(run.cwd === undefined ? {} : { cwd: run.cwd }),
        timeoutMs: run.timeout_ms,
        guardPaths: run.guard_paths,
        expect: 'pass',
      }),
  );
}

async function applyGate(
  ctx: EngineCtx,
  t: VerifyTarget,
  state: StageState,
  row: StageRun,
  outcome: StageJobOutcome,
): Promise<void> {
  const { deps } = ctx;
  const { snapshot } = state;
  const label = labelOf(snapshot, row);
  if (
    !outcome.ok ||
    outcome.verdict.status === 'error' ||
    outcome.verdict.status === 'skipped'
  ) {
    const why = outcome.ok
      ? outcome.verdict.report
      : outcome.error instanceof Error
        ? outcome.error.message
        : String(outcome.error);

    await deps.storage.transaction((tx) =>
      finishStageRun(tx, row.id, 'error', { note: why.slice(0, 1000) }, ctx.nowIso),
    );

    await parkVerifying(
      ctx,
      t,
      `${label} could not run: ${why.slice(0, 500)}; needs you`,
    );

    return;
  }

  const { verdict } = outcome;
  const name = `script-${row.stage_id}${row.member_id === '' ? '' : `-${row.member_id}`}.txt`;
  const ref = await deps.reports.put(t.run.id, name, verdict.report);
  const gate = { status: verdict.status, report_ref: ref } as const;
  if (verdict.status === 'passed') {
    await deps.storage.transaction(async (tx) => {
      await finishStageRun(tx, row.id, 'passed', { gate }, ctx.nowIso);
      if (pipelineHasChecks(snapshot)) {
        await persistArtifacts(
          tx,
          t.ticket.id,
          row.id,
          [makeDraft('gate_report', `${label}: passed\n\n${verdict.report}`)],
          ctx.nowIso,
        );
      }
    });

    return;
  }

  const findings =
    verdict.findings.length > 0
      ? verdict.findings.map((f) => `${f.check}: ${f.message}`).join('\n')
      : verdict.report;

  const policy = policyOf(snapshot, row);
  const args = {
    stage: { id: row.stage_id, member: row.member_id, kind: 'script_gate' as const },
    label,
    findings: `${label} failed.\n${findings}`,
    outcome: { gate },
    rowId: row.id,
  };

  await deps.storage.transaction(async (tx) => {
    await (policy.on_blocking === 'hold'
      ? holdForOwnerTx(ctx, tx, t, args)
      : sendBackTx(ctx, tx, t, args));
  });
}

/** Applies every script gate of this ticket that finished since the last tick; true when one was applied. */
export async function applyFinishedGates(
  ctx: EngineCtx,
  t: VerifyTarget,
  state: StageState,
): Promise<boolean> {
  let applied = false;
  for (const stage of state.snapshot.definition.stages) {
    for (const m of scriptMembers(stage)) {
      const row = state.records.find(
        (r) =>
          r.stage_id === stage.id &&
          r.member_id === m.id &&
          r.cycle === state.cycle &&
          r.status === 'running',
      );

      const done = row
        ? takeFinishedJob(ctx, stageJobKey(t.ticket.id, t.run.id, stage.id, m.id))
        : null;

      if (row && done) {
        await applyGate(ctx, t, state, row, done.outcome);
        applied = true;
      }
    }
  }

  return applied;
}

/** Starts again any script gate of the awaited `stage` whose row says running but whose job is gone (a restart). */
export async function resumeLostGates(
  ctx: EngineCtx,
  t: VerifyTarget,
  state: StageState,
  stage: Stage,
): Promise<void> {
  for (const m of scriptMembers(stage)) {
    const row = state.records.find(
      (r) =>
        r.stage_id === stage.id &&
        r.member_id === m.id &&
        r.cycle === state.cycle &&
        r.status === 'running',
    );

    if (row && !hasJob(ctx, stageJobKey(t.ticket.id, t.run.id, stage.id, m.id))) {
      await startScriptMember(ctx, t, state, stage, { id: m.id, stage: m.def });
    }
  }
}
