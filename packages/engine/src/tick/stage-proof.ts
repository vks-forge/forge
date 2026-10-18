/**
 * Red proof result: what a finished red proof means for its tester stage.
 *
 * Why: a test-writer's new tests must fail before the implementation exists (d-0015), and the proof
 *   that checks it is advisory: tests that already pass are reported to the next reviewer and noted
 *   on the card, never a block, and a proof that could not run is skipped with a note so work goes
 *   on. This writes that result on the proof's stage row and, for a pipeline with checks, as the
 *   `test_report` artifact a later stage reads. It lives apart from the in-progress phase so that
 *   file stays about what follows a writer.
 *
 * Exports: testCheck(), finishProof().
 * Depends on: @forge/core (stage types), tick/{card-log,stage-artifacts,stage-records,tick-config}, types/stage-runner.
 *   Writes inside the caller's transaction.
 */

import type { StorageTx, Ticket, TicketPipeline } from '@forge/core';
import { ENGINE_ACTOR, logCardEvent } from '#/tick/card-log.js';
import {
  makeDraft,
  persistArtifacts,
  pipelineHasChecks,
} from '#/tick/stage-artifacts.js';
import { finishStageRun } from '#/tick/stage-records.js';
import { projectSettings } from '#/tick/tick-config.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { StageJobOutcome } from '#/types/stage-runner.types.js';

/** The project's test check, the command the red proof runs. */
export function testCheck(ctx: EngineCtx, slug: string) {
  return projectSettings(ctx.config, slug).checks.find((c) => c.role === 'test');
}

/** Writes the proof's result on its row and, for a pipeline with checks, as the test report. */
export async function finishProof(
  ctx: EngineCtx,
  tx: StorageTx,
  ticket: Ticket,
  snapshot: TicketPipeline,
  rowId: number,
  outcome: StageJobOutcome,
): Promise<void> {
  const ran =
    outcome.ok &&
    outcome.verdict.status !== 'error' &&
    outcome.verdict.status !== 'skipped';

  const red = outcome.ok && outcome.verdict.status === 'passed';
  const report = outcome.ok
    ? outcome.verdict.report
    : `The red proof could not run: ${outcome.error instanceof Error ? outcome.error.message : String(outcome.error)}`;

  const note = red
    ? 'the new tests fail before the implementation, as they should'
    : ran
      ? 'the new tests already pass before the implementation, so they may not test the change'
      : 'the red proof could not run; it is advisory, so work goes on';

  await finishStageRun(
    tx,
    rowId,
    ran ? 'passed' : 'skipped',
    { red, note, ...(outcome.ok ? { gate: { status: outcome.verdict.status } } : {}) },
    ctx.nowIso,
  );

  if (pipelineHasChecks(snapshot)) {
    await persistArtifacts(
      tx,
      ticket.id,
      rowId,
      [makeDraft('test_report', `${note}\n\n${report}`)],
      ctx.nowIso,
    );
  }

  if (ran && !red) {
    await logCardEvent(tx, ticket.card_id, {
      kind: 'note',
      at: ctx.nowIso,
      actor: ENGINE_ACTOR,
      payload: { text: `${ticket.id}: ${note}.` },
    });
  }
}
