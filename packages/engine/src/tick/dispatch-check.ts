/**
 * Starts the check runs of a verifying ticket: reviewers and researchers, read-only.
 *
 * Why: after the gates pass, an independent agent reads the change. It must stay independent in
 *   three ways this file keeps: it never becomes the ticket's assignee (the run the gates and
 *   the merge judge stays the last writer's), its prompt is rendered from typed artifacts with
 *   the Worker's own account stripped (tick/stage-prompt), and it never resumes a writer's
 *   session (it starts fresh). A group starts all its agent members together; the group passes
 *   when every member has reported. The attempt row and the artifacts the agent was shown are
 *   written in the same transaction as the run row, so what the owner reads on the ticket page
 *   is exactly what the reviewer got. Limits and quota pauses apply as for any run: the scheduler
 *   picked this ticket for its first agent, and each further member is placed the same way.
 *
 * Exports: startChecks().
 * Depends on: @forge/core (ArtifactKind, stageInputs), domain/harness-choice, tick/{launch-run,project-runtime,
 *   run-agent,stage-artifacts,stage-prompt,stage-records,stage-state,verify-outcomes}. IO: git diff, storage, driver.
 */

import { ArtifactKind, stageInputs } from '@forge/core';
import type { AgentStage, Project, StorageTx } from '@forge/core';
import { chooseHarness } from '#/domain/harness-choice.js';
import { launchRun } from '#/tick/launch-run.js';
import { baseRefFor, driverFor, runtimeFor } from '#/tick/project-runtime.js';
import { resolveStageAgent } from '#/tick/run-agent.js';
import { collectArtifacts, persistArtifacts } from '#/tick/stage-artifacts.js';
import { renderCheckPrompt } from '#/tick/stage-prompt.js';
import { beginStageRun } from '#/tick/stage-records.js';
import { readStageState } from '#/tick/stage-state.js';
import { projectSettings } from '#/tick/tick-config.js';
import { parkVerifying } from '#/tick/verify-outcomes.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { PausedHarness } from '#/types/pick-next.types.js';
import type { Candidate } from '#/types/tick.types.js';

const ALL_KINDS = ArtifactKind.options;

async function pausedHarnesses(
  tx: StorageTx,
  now: number,
): Promise<Record<string, PausedHarness>> {
  const paused: Record<string, PausedHarness> = {};
  for (const s of await tx.harnessState.list()) {
    const until = Date.parse(s.paused_until);
    if (until > now) {
      paused[s.harness_id] = { until, reason: s.reason };
    }
  }

  return paused;
}

/**
 * Starts the agent members of the ticket's due check stage; returns true when at least one run
 * is live. The wake behind `c` is consumed with the first run. Never throws for an agent that
 * cannot run: that parks the ticket from Verifying with the reason.
 */
export async function startChecks(
  ctx: EngineCtx,
  c: Candidate,
  project: Project,
  scheduled?: string,
): Promise<boolean> {
  const { deps } = ctx;
  const { ticket } = c;
  const prepared = await deps.storage.transaction(async (tx) => ({
    state: await readStageState(tx, ticket.id),
    writer: ticket.assignee_run_id ? await tx.runs.get(ticket.assignee_run_id) : null,
    paused: await pausedHarnesses(tx, ctx.now),
  }));

  const { state, writer, paused } = prepared;
  if (
    state?.cursor.kind !== 'run_checks' ||
    !writer ||
    !ticket.branch ||
    !ticket.worktree
  ) {
    return false;
  }

  const runtime = runtimeFor(ctx, project.slug);
  if (!runtime) {
    throw new Error(`project ${project.slug} has no runtime on this server`);
  }

  const { cursor } = state;
  const wt = await runtime.worktrees.create(
    ticket.id,
    ticket.branch,
    baseRefFor(ctx, project.slug),
  );

  const diff = (await runtime.worktrees.diff(wt.path, wt.baseSha)).patch;
  const settings = projectSettings(ctx.config, project.slug);
  let started = false;
  let wake = c.wake;

  for (const m of cursor.members) {
    if (m.stage.kind !== 'agent') {
      continue;
    }

    const stage: AgentStage = m.stage;
    const agent = resolveStageAgent(ctx.config, project.slug, stage.agent);
    if (!agent) {
      await parkVerifying(
        ctx,
        { ticket, run: writer },
        `the "${stage.label}" check needs agent "${stage.agent}", which is missing, disabled or archived. Restore it or change the pipeline, then retry.`,
      );

      return started;
    }

    const fallbacks =
      agent.fallbackHarnesses.length > 0
        ? agent.fallbackHarnesses
        : (settings.harness_fallbacks ?? ctx.config.forge.engine.harness_fallbacks);

    const harness =
      !started && scheduled !== undefined
        ? scheduled
        : chooseHarness(
            agent.harnessId,
            fallbacks,
            paused,
            (id) => deps.drivers.get(id) !== null,
            ctx.now,
          );

    const driver = driverFor(ctx, project.slug, harness);
    const stageId = cursor.stage.id;
    const label =
      cursor.stage.kind === 'group'
        ? `${cursor.stage.label}: ${stage.label}`
        : stage.label;

    const kinds = stageInputs(agent.definition.role, agent.definition.inputs, ALL_KINDS);
    const drafts = await deps.storage.transaction((tx) =>
      collectArtifacts(tx, { ticket, run: writer, kinds, diff }),
    );

    const launched = await launchRun(ctx, {
      ticket,
      agent,
      harness,
      driver,
      wt,
      prompt: renderCheckPrompt(
        { name: agent.definition.name, instructions: agent.definition.instructions },
        label,
        drafts,
      ),
      previous: null,
      wake,
      inTx: async (tx, runId) => {
        const rowId = await beginStageRun(tx, ctx.nowIso, {
          ticket_id: ticket.id,
          stage_id: stageId,
          member_id: m.id,
          cycle: state.cycle,
          kind: 'agent',
          agent_id: agent.id,
          agent_hash: agent.hash,
          run_id: runId,
        });

        if (rowId !== null) {
          await persistArtifacts(tx, ticket.id, rowId, drafts, ctx.nowIso);
        }
      },
    });

    wake = undefined;
    if (launched) {
      started = true;
      ctx.report.dispatched.push({
        ticketId: ticket.id,
        runId: launched.runId,
        kind: 'stage',
      });
    }
  }

  return started;
}
