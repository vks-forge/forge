/**
 * Planning step IO: the model call of a step and the one transaction that records its result.
 *
 * Why: every planning step has the same frame. It announces itself (`step_started`), makes its
 *   model call under its own timeout while counting what the call cost, and then records
 *   everything it learned in one transaction: the new grill state, the step's one-line summary
 *   for the steps after it, the files it read, the cursor moved past it, its `step_finished`
 *   event (with the files read and the settings version it ran under, as evidence) and any
 *   writes of its own. One transaction means a crash leaves either nothing or the whole step,
 *   so the flow resumes at the right step and never half-records one. A failing model call
 *   writes a plain note to the card and leaves the queued turn claimed, so the step is tried
 *   again once the claim goes stale, rather than a card stalling silently. A budget failure is
 *   the exception: the per-step cap is too small for the step, so every retry would spend the
 *   same money and fail the same way. That step raises Needs you instead (raise the cap, or
 *   retry now), and its queued turn is released by the caller. Whatever a call cost is written to the
 *   Director spend ledger (through `addDirectorSpend`, the one door): a finished step records its cost
 *   with its result, and a call that failed records what its harness reported at once, so a failing
 *   step is never free in the totals.
 *
 * Exports: startStep(), callStep(), recordCarriedSpend(), finishStep().
 * Depends on: @forge/core (step schemas, grill types), steps/run-step, tick/card-budget,
 *   tick/planning-state, types/card-planning. Writes inside its own transactions.
 */

import type { FlowStep, GrillState, StepName, StorageTx } from '@forge/core';
import type { ZodType } from 'zod';
import { rejectStep, runStep } from '#/steps/run-step.js';
import { addDirectorSpend } from '#/tick/card-budget.js';
import { askStepBudget, logPlanEvent, stamp } from '#/tick/planning-state.js';
import type { ModelCall, PlanCtx, StepFinish } from '#/types/card-planning.types.js';
import type { StepExtras } from '#/types/run-step.types.js';

/** Writes `step_started` so the card shows which step the Director is on. */
export async function startStep(pc: PlanCtx, step: FlowStep): Promise<void> {
  await pc.ctx.deps.storage.transaction((tx) =>
    logPlanEvent(tx, pc.card.id, stamp(pc), {
      kind: 'step_started',
      payload: { step_id: step.id, step_kind: step.kind, label: step.label },
    }),
  );
}

/**
 * Closes a step that produced no result (it waits for the owner, or it failed): every `step_started`
 * gets a `step_finished`, so the card never reads "the Director is thinking" while it waits on the owner.
 */
async function endStepWithout(
  tx: StorageTx,
  pc: PlanCtx,
  step: FlowStep,
  outcome: 'paused_for_you' | 'failed',
): Promise<void> {
  await logPlanEvent(tx, pc.card.id, stamp(pc), {
    kind: 'step_finished',
    payload: {
      step_id: step.id,
      step_kind: step.kind,
      label: step.label,
      files_read: [],
      config_version: pc.configVersion,
      summary: '',
      outcome,
    },
  });
}

/** Runs one model call under the step's configured timeout and counts its cost; a failure is noted on the card. */
export async function callStep<T>(
  pc: PlanCtx,
  step: FlowStep,
  name: StepName,
  schema: ZodType<T>,
  input: Record<string, unknown>,
  extras: Pick<StepExtras, 'budgetUsd'> = {},
): Promise<ModelCall<T>> {
  let cost = 0;
  let reported = false;
  const result = await runStep(pc.ctx, name, input, schema, {
    timeoutMs: pc.director.step_timeouts_ms[name],
    ...(extras.budgetUsd === undefined ? {} : { budgetUsd: extras.budgetUsd }),
    onCost: (usd) => {
      cost += usd;
      reported = true;
    },
  });

  if (result.ok) {
    return { ok: true, value: result.value, cost };
  }

  rejectStep(pc.ctx, name, pc.card.id, result.error);
  const failed = {
    kind: step.kind,
    model: pc.ctx.config.forge.models.director[name],
    recorded: reported,
  };

  if (result.error.kind === 'budget') {
    await pc.ctx.deps.storage.transaction(async (tx) => {
      await addDirectorSpend(
        tx,
        pc.card.id,
        cost,
        stamp(pc),
        pc.director.budget_warning_usd,
        failed,
      );

      await endStepWithout(tx, pc, step, 'paused_for_you');
      await askStepBudget(
        tx,
        pc.card.id,
        stamp(pc),
        step.label,
        extras.budgetUsd ?? pc.ctx.config.forge.engine.step_budget_usd,
      );
    });

    return { ok: false, cost, outcome: 'blocked' };
  }

  await pc.ctx.deps.storage.transaction(async (tx) => {
    await addDirectorSpend(
      tx,
      pc.card.id,
      cost,
      stamp(pc),
      pc.director.budget_warning_usd,
      failed,
    );

    await endStepWithout(tx, pc, step, 'failed');
    await logPlanEvent(tx, pc.card.id, stamp(pc), {
      kind: 'note',
      payload: {
        text: `The Director could not run "${step.label}" (${result.error.kind}: ${result.error.message}). It will try again shortly.`,
      },
    });
  });

  return { ok: false, cost, outcome: 'stop' };
}

/**
 * Writes the cost of earlier rounds of a step whose later call failed. A step that reads or researches
 * in rounds adds each round's cost up for its result; when a round fails there is no result to carry
 * the sum, so the rounds before it are recorded here and the failed call records itself in `callStep`.
 */
export async function recordCarriedSpend(
  pc: PlanCtx,
  step: FlowStep,
  usd: number,
): Promise<void> {
  if (usd <= 0) {
    return;
  }

  await pc.ctx.deps.storage.transaction((tx) =>
    addDirectorSpend(tx, pc.card.id, usd, stamp(pc), pc.director.budget_warning_usd, {
      kind: step.kind,
    }),
  );
}

/** Records a finished step in one transaction and moves the cursor to the next step. */
export async function finishStep(
  pc: PlanCtx,
  step: FlowStep,
  done: StepFinish,
): Promise<GrillState> {
  const at = stamp(pc);

  return pc.ctx.deps.storage.transaction(async (tx) => {
    const state = await tx.cardPlanning.get(pc.card.id);
    const patched = done.patch ? done.patch(state.grill) : state.grill;
    const paths = new Set(patched.files_read.map((f) => f.path));
    const grill: GrillState = {
      ...patched,
      files_read: [
        ...patched.files_read,
        ...done.files.filter((f) => !paths.has(f.path)),
      ],
      step_summaries: [
        ...patched.step_summaries.filter((s) => s.step_id !== step.id),
        {
          step_id: step.id,
          step_kind: step.kind,
          label: step.label,
          summary: done.summary,
        },
      ],
    };

    await tx.cardPlanning.update(pc.card.id, { flow_cursor: done.index + 1, grill });
    await logPlanEvent(tx, pc.card.id, at, {
      kind: 'step_finished',
      payload: {
        step_id: step.id,
        step_kind: step.kind,
        label: step.label,
        files_read: [...done.files],
        config_version: pc.configVersion,
        summary: done.summary,
      },
    });

    await done.after?.(tx, grill);
    await addDirectorSpend(
      tx,
      pc.card.id,
      done.cost,
      at,
      pc.director.budget_warning_usd,
      {
        kind: step.kind,
      },
    );

    return { ...grill, director_spend_usd: grill.director_spend_usd + done.cost };
  });
}
