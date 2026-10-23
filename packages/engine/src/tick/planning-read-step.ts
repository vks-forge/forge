/**
 * Planning read step: the read-round loop that survey and verify share.
 *
 * Why: survey and verify are tool-less model calls that may ask the engine to look at the code, in
 *   at most two rounds (d-0131). The loop calls the step, runs its `read_requests` through
 *   `admit()` and calls it again with the results, so every read is deterministic and recorded.
 *   A survey is held to one more rule: it may not answer `findings` having read no file of a
 *   repository that has some. A survey that guessed from the card text lets the grill ask the
 *   owner what the code answers (T2 in the eval), so such an answer is sent back as a read round
 *   with `previous_error`; if it still read nothing on the last round it is kept but marked
 *   `readNothing`, and the grill is told it could not look. Round 0 of a survey is shown the
 *   tracked file list.
 *
 * Exports: READ_FIRST_ERROR, readStep().
 * Depends on: @forge/core (FlowStep, StepName), tick/planning-input, tick/planning-reads,
 *   tick/planning-repo-files, tick/planning-state, tick/planning-step-io, types/card-planning.
 */

import type { CardPlanningState, FlowStep, StepName } from '@forge/core';
import type { ZodType } from 'zod';
import { buildStepInput } from '#/tick/planning-input.js';
import { MAX_READ_ROUNDS, runReads } from '#/tick/planning-reads.js';
import { repoFilesOf } from '#/tick/planning-repo-files.js';
import { latestPlanOf, logPlanEvent } from '#/tick/planning-state.js';
import { callStep, recordCarriedSpend } from '#/tick/planning-step-io.js';
import type {
  PlanCtx,
  ReadBudget,
  ReadOutput,
  ReadResult,
  ReadStepResult,
} from '#/types/card-planning.types.js';

/** What a survey that answered without reading is told. */
export const READ_FIRST_ERROR = 'read the files you need before findings';

/** The read-round loop of survey and verify; the failing outcome when the step failed (already reported on the card). */
export async function readStep<F>(
  pc: PlanCtx,
  planning: CardPlanningState,
  step: FlowStep,
  name: Extract<StepName, 'card_survey' | 'verify'>,
  schema: ZodType<ReadOutput<F>>,
): Promise<ReadStepResult<F> | 'stop' | 'blocked'> {
  const caps = pc.director.read_caps;
  const budget: ReadBudget = {
    filesLeft: caps.max_files,
    bytesLeft: caps.max_bytes,
    filesRead: [],
  };

  const survey = name === 'card_survey';
  const repo = survey ? await repoFilesOf(pc) : { paths: [], truncated: false };
  const previous = planning.grill.pending_changes ? await latestPlanOf(pc) : null;
  const results: ReadResult[] = [];
  let sentBack: string | undefined;
  let cost = 0;
  for (let round = 0; round <= MAX_READ_ROUNDS; round++) {
    const input = await buildStepInput(pc, planning.grill, step, previous, {
      read_results: results,
      read_round: round,
      reads_remaining: MAX_READ_ROUNDS - round,
      read_caps: { files_left: budget.filesLeft, bytes_left: budget.bytesLeft },
      ...(survey && round === 0
        ? { repo_files: repo.paths, repo_files_truncated: repo.truncated }
        : {}),
      ...(sentBack === undefined ? {} : { previous_error: sentBack }),
    });

    sentBack = undefined;
    const call = await callStep(pc, step, name, schema, input);
    cost += call.cost;
    if (!call.ok) {
      await recordCarriedSpend(pc, step, cost - call.cost);

      return call.outcome;
    }

    const out = call.value;
    if (out.findings !== undefined) {
      const readNothing =
        survey && budget.filesRead.length === 0 && repo.paths.length > 0;

      if (!readNothing || round === MAX_READ_ROUNDS) {
        return {
          findings: out.findings,
          files: budget.filesRead,
          cost,
          decisions: out.step_decisions ?? {},
          ...(readNothing ? { readNothing } : {}),
        };
      }

      sentBack = READ_FIRST_ERROR;
    } else if (round === MAX_READ_ROUNDS) {
      break;
    }

    results.push(...(await runReads(pc, out.read_requests ?? [], budget)));
  }

  await failedWithReads(pc, step, name);

  return 'stop';
}

/** The step kept asking for reads after its last round: the answer is unusable, reported like any rejected step. */
async function failedWithReads(
  pc: PlanCtx,
  step: FlowStep,
  name: StepName,
): Promise<void> {
  const message = 'it still asked for reads after the last read round';
  pc.ctx.report.rejectedSteps.push({
    step: name,
    ticketId: pc.card.id,
    reason: `invalid_output: ${message}`,
  });

  await pc.ctx.deps.storage.transaction((tx) =>
    logPlanEvent(tx, pc.card.id, pc.ctx.nowIso, {
      kind: 'note',
      payload: {
        text: `The Director could not finish "${step.label}" (${message}). It will try again shortly.`,
      },
    }),
  );
}
