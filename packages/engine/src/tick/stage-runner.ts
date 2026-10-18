/**
 * Stage runner (verifying side): performs what the ticket's pipeline asks for next.
 *
 * Why: once the last writer is done the ticket waits in Verifying while the rest of its pipeline
 *   runs: the gates, the checks, the Director's check against the plan, the sign-off, then the
 *   merge. Which of those comes next is not stored; it is the cursor over the stage rows. Each tick
 *   this takes the ticket's snapshot (checking it again if the ticket never had one), lets routing
 *   rules add checks on the real diff, applies script gates and Director checks that finished,
 *   reads the cursor and does exactly one kind of thing: run the gates (the existing G1 job,
 *   unchanged), start the checks (one `stage` wake per agent member, so the scheduler places each
 *   against the Worker limits; a background job for scripts), start the Director check (a step, not
 *   a Worker), decide the sign-off (the Director signs low-risk work that passed everything, else
 *   the owner is asked), wait, or call the merge door with `hold` when the owner's stage is still
 *   open and `directorSigned` when the Director signed. When a step completes it asks the cursor
 *   again in the same tick, so an Express ticket goes from gates to merge exactly as it did before
 *   pipelines. A state the cursor should not produce for a verifying ticket (a writer is due) is
 *   not guessed at: the ticket is parked with the reason (fail closed).
 *
 * Exports: driveStages().
 * Depends on: @forge/core (routeStages, classifyStage, pipelineHash), tick/{stage-artifacts,stage-director-apply,stage-director-check,
 *   stage-gates,stage-records,stage-sign-off,stage-snapshot,stage-state,verify-outcomes,tick-config}, types/stage-runner.
 *   IO through the hooks and storage.
 */

import { InvalidInputError, classifyStage, pipelineHash, routeStages } from '@forge/core';
import type { Cursor, Stage } from '@forge/core';
import {
  makeDraft,
  persistArtifacts,
  pipelineHasChecks,
} from '#/tick/stage-artifacts.js';
import {
  applyFinishedGates,
  resumeLostGates,
  startScriptMember,
} from '#/tick/stage-gates.js';
import { applyFinishedChecks } from '#/tick/stage-director-apply.js';
import { resumeDirectorCheck, startDirectorCheck } from '#/tick/stage-director-check.js';
import { recordStage, requestStageWake } from '#/tick/stage-records.js';
import { directorSignature, signOff } from '#/tick/stage-sign-off.js';
import { ensureSnapshotTx } from '#/tick/stage-snapshot.js';
import { readStageState } from '#/tick/stage-state.js';
import { projectSettings } from '#/tick/tick-config.js';
import { parkVerifying } from '#/tick/verify-outcomes.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { StageState, VerifyHooks } from '#/types/stage-runner.types.js';
import type { VerifyTarget } from '#/types/verify.types.js';

/** One tick follows the pipeline through at most this many completed steps (gates, then merge, is two). */
const MAX_STEPS = 6;

/** Lets the project's routing rules add checks for the paths the real diff touches; idempotent. */
async function routeAtDiff(
  ctx: EngineCtx,
  t: VerifyTarget,
  state: StageState,
): Promise<void> {
  const key = `${t.ticket.id}:${t.run.id}`;
  const rules = projectSettings(ctx.config, t.project.slug).pipelines?.routing ?? [];
  if (ctx.state.diffRouted.has(key) || rules.length === 0) {
    return;
  }

  const diff = await t.runtime.worktrees.diff(t.worktree, t.baseSha);
  const paths = diff.files.flatMap((f) => (f.oldPath ? [f.path, f.oldPath] : [f.path]));
  const { definition, fired } = routeStages(
    state.snapshot.definition,
    rules,
    paths,
    state.snapshot.roles,
  );

  ctx.state.diffRouted.add(key);
  if (fired.length === 0) {
    return;
  }

  await ctx.deps.storage.transaction((tx) =>
    tx.ticketPipelines.appendRouted(t.ticket.id, {
      definition,
      hash: pipelineHash(definition),
      routed: [
        ...state.snapshot.routed,
        ...fired.map((f) => ({ ...f, at: 'diff' as const })),
      ],
      at: ctx.nowIso,
    }),
  );
}

/** The ticket's stage state for this tick, or null when the ticket was parked or is no longer verifying. */
async function prepare(ctx: EngineCtx, t: VerifyTarget): Promise<StageState | null> {
  const { storage } = ctx.deps;
  try {
    await storage.transaction((tx) => ensureSnapshotTx(tx, ctx, t.ticket));
  } catch (e) {
    if (e instanceof InvalidInputError) {
      await parkVerifying(ctx, t, e.message);

      return null;
    }

    throw e;
  }

  let state = await storage.transaction((tx) => readStageState(tx, t.ticket.id));
  if (!state) {
    return null;
  }

  await routeAtDiff(ctx, t, state);
  const gated = await applyFinishedGates(ctx, t, state);
  const checked = await applyFinishedChecks(ctx, t, state);
  if (gated || checked) {
    const fresh = await storage.transaction(async (tx) => ({
      ticket: await tx.tickets.get(t.ticket.id),
      state: await readStageState(tx, t.ticket.id),
    }));

    // A gate that failed sent the work back (or parked the ticket): nothing more to do for it now.
    if (fresh.ticket?.status !== 'verifying') {
      return null;
    }

    state = fresh.state;
  } else {
    state = await storage.transaction((tx) => readStageState(tx, t.ticket.id));
  }

  return state;
}

/** G1 passed: its stage passes (once) and, in a pipeline with checks, its report is kept for them. */
async function recordG1Pass(
  ctx: EngineCtx,
  t: VerifyTarget,
  state: StageState,
  stage: Stage,
  report: string | undefined,
): Promise<void> {
  await ctx.deps.storage.transaction(async (tx) => {
    const id = await recordStage(
      tx,
      ctx.nowIso,
      {
        ticket_id: t.ticket.id,
        stage_id: stage.id,
        member_id: '',
        cycle: state.cycle,
        kind: 'script_gate',
        run_id: t.run.id,
      },
      'passed',
      { gate: { status: 'passed' } },
    );

    if (id !== null && report !== undefined && pipelineHasChecks(state.snapshot)) {
      await persistArtifacts(
        tx,
        t.ticket.id,
        id,
        [makeDraft('gate_report', report)],
        ctx.nowIso,
      );
    }
  });
}

/** Starts the due check stage: scripts as background jobs, agents through one `stage` wake. */
async function startCheckStage(
  ctx: EngineCtx,
  t: VerifyTarget,
  state: StageState,
  cursor: Extract<Cursor, { kind: 'run_checks' }>,
): Promise<void> {
  for (const m of cursor.members) {
    if (m.stage.kind === 'script_gate') {
      await startScriptMember(ctx, t, state, cursor.stage, m);
    }
  }

  // One wake per agent member: each is placed by the scheduler against the Worker limits on its own.
  const agents = cursor.members.filter((m) => m.stage.kind === 'agent');
  if (agents.length > 0) {
    await ctx.deps.storage.transaction(async (tx) => {
      for (const m of agents) {
        await requestStageWake(
          ctx,
          tx,
          t.ticket.id,
          cursor.stage.id,
          cursor.cycle,
          `stage:${cursor.stage.id}`,
          undefined,
          m.id,
        );
      }
    });
  }
}

/**
 * Drives the verifying ticket `t` as far as it can go this tick. `hooks` supply the three
 * things that stay in the verify phase: the G1 gates, the gate rows and the merge door.
 */
export async function driveStages(
  ctx: EngineCtx,
  t: VerifyTarget,
  hooks: VerifyHooks,
): Promise<void> {
  for (let step = 0; step < MAX_STEPS; step++) {
    const state = await prepare(ctx, t);
    if (!state) {
      return;
    }

    const { cursor } = state;
    switch (cursor.kind) {
      case 'start_gates': {
        const g1 = await hooks.g1(ctx, t);
        if (g1.kind !== 'pass') {
          return;
        }

        await recordG1Pass(ctx, t, state, cursor.stage, g1.report);
        break;
      }

      case 'run_checks':
        return startCheckStage(ctx, t, state, cursor);
      case 'director_check':
        if ((await startDirectorCheck(ctx, t, state, cursor.stage)) === 'skipped') {
          break;
        }

        return;
      case 'sign_off':
        if ((await signOff(ctx, t, state, cursor.stage, hooks)) === 'signed') {
          break;
        }

        return;
      case 'await': {
        const roles = state.snapshot.roles;
        if (classifyStage(cursor.stage, roles) === 'unknown') {
          await parkVerifying(
            ctx,
            t,
            `the "${cursor.stage.label}" stage names an agent this ticket's pipeline does not know; needs you`,
          );

          return;
        }

        if (cursor.stage.kind === 'director_check') {
          return resumeDirectorCheck(ctx, t, state, cursor.stage);
        }

        return resumeLostGates(ctx, t, state, cursor.stage);
      }

      case 'merge': {
        const signed = directorSignature(state);

        return hooks.merge(ctx, t, await hooks.rows(ctx, t), {
          hold: cursor.hold,
          ...(signed === null ? {} : { directorSigned: true, signReason: signed }),
        });
      }

      case 'done':
        return;
      default:
        // A writer or a proof is due, yet the ticket is verifying: the rows disagree with the status.
        await parkVerifying(
          ctx,
          t,
          `the pipeline of ${t.ticket.id} is at "${cursor.stage.label}" but the ticket is verifying; needs you`,
        );

        return;
    }
  }
}
