/**
 * Which writer a dispatch starts: the stage the ticket's pipeline is at, and the agent it names.
 *
 * Why: the first dispatch of a ticket takes its pipeline snapshot (checked against the roster as it
 *   is now), and the cursor over the stage rows says which writer is due. That writer's agent runs, not
 *   a lane default; if the agent cannot run (missing, disabled, archived) the ticket is parked with the
 *   reason instead of running someone else (fail closed), and a pipeline that fails its own rules
 *   parks it too. A wake that arrives when the rows say no writer is due (a red proof is running, the
 *   gates are next) is stale and starts nothing. A ticket that has no pipeline snapshot yet cannot
 *   happen after the first dispatch; work from before pipelines continues on the agent its earlier
 *   run used, else the implementer.
 *
 * Exports: chooseWriter(). A group of writers starts the member it is asked for.
 * Depends on: @forge/core (InvalidInputError), steps/run-step, tick/{dispatch-park,run-agent,stage-snapshot,
 *   stage-state}, types/stage-runner. IO: storage.
 */

import { InvalidInputError } from '@forge/core';
import type { Run, Ticket } from '@forge/core';
import { hold } from '#/steps/run-step.js';
import { parkDispatch } from '#/tick/dispatch-park.js';
import { resolveAgent, resolveStageAgent } from '#/tick/run-agent.js';
import { ensureSnapshotTx } from '#/tick/stage-snapshot.js';
import { readStageState } from '#/tick/stage-state.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { StageState, WriterChoice } from '#/types/stage-runner.types.js';

/** The ticket's stage state at dispatch, taking its snapshot first; `parked` when its pipeline cannot run. */
async function stageStateFor(
  ctx: EngineCtx,
  ticket: Ticket,
): Promise<StageState | null | 'parked'> {
  try {
    return await ctx.deps.storage.transaction(async (tx) => {
      await ensureSnapshotTx(tx, ctx, ticket);

      return readStageState(tx, ticket.id);
    });
  } catch (e) {
    // A pipeline that fails its rules under today's roster cannot be fixed by a retry.
    if (e instanceof InvalidInputError) {
      await parkDispatch(ctx, ticket, e);

      return 'parked';
    }

    throw e;
  }
}

/** The writer to start for `ticket`, or `stop` when nothing should start (the ticket was parked, or no writer is due). */
export async function chooseWriter(
  ctx: EngineCtx,
  ticket: Ticket,
  slug: string,
  previous: Run | null,
  member?: string,
): Promise<WriterChoice> {
  const state = await stageStateFor(ctx, ticket);
  if (state === 'parked') {
    return { kind: 'stop' };
  }

  if (state?.cursor.kind === 'run_writers') {
    // The members of a writer group start one at a time, each the one the scheduler placed.
    const { stage, members } = state.cursor;
    const pick = member === undefined ? members[0] : members.find((m) => m.id === member);
    if (!pick || pick.stage.kind !== 'agent') {
      ctx.deps.log?.(
        'warn',
        `${ticket.id}: dispatch skipped, ${member ?? 'no member'} of ${stage.id} is not due`,
      );

      hold(ctx, `dispatch:${ticket.id}`);

      return { kind: 'stop' };
    }

    const agent = resolveStageAgent(ctx.config, slug, pick.stage.agent);
    if (!agent) {
      await parkDispatch(
        ctx,
        ticket,
        new InvalidInputError(
          `the "${pick.stage.label}" stage needs agent "${pick.stage.agent}", which is missing, disabled or archived. Restore it or change the pipeline, then retry.`,
        ),
      );

      return { kind: 'stop' };
    }

    return {
      kind: 'go',
      agent,
      stage: { id: stage.id, label: `${stage.label}: ${pick.stage.label}` },
      memberId: pick.id,
      state,
    };
  }

  if (state?.cursor.kind === 'run_writer') {
    const { stage } = state.cursor;
    const agent = resolveStageAgent(ctx.config, slug, stage.agent);
    if (!agent) {
      await parkDispatch(
        ctx,
        ticket,
        new InvalidInputError(
          `the "${stage.label}" stage needs agent "${stage.agent}", which is missing, disabled or archived. Restore it or change the pipeline, then retry.`,
        ),
      );

      return { kind: 'stop' };
    }

    return { kind: 'go', agent, stage, state };
  }

  if (state) {
    // The rows say no writer is due (a proof is running, the gates are next): a wake now is stale.
    ctx.deps.log?.(
      'warn',
      `${ticket.id}: dispatch skipped, its pipeline is at ${state.cursor.kind}`,
    );

    hold(ctx, `dispatch:${ticket.id}`);

    return { kind: 'stop' };
  }

  return {
    kind: 'go',
    agent: resolveAgent(ctx.config, slug, ticket.lane, previous?.agent_id),
    state: null,
  };
}
