/**
 * Starts the check runs of a verifying ticket: reviewers and researchers, read-only.
 *
 * Why: after the gates pass, an independent agent reads the change. It must stay independent in
 *   three ways this file keeps: it never becomes the ticket's assignee (the run the gates and
 *   the merge judge stays the last writer's), its prompt is rendered from typed artifacts with
 *   the Worker's own account stripped (tick/stage-prompt), and it never resumes a writer's
 *   session (it starts fresh). A group's agent members are started one wake at a time, each placed
 *   by the scheduler against the Worker limits (a reviewer and a critic are two Workers, so under a
 *   per-project limit of one they run one after the other), and the group passes when every member
 *   has reported. The attempt row and the artifacts the agent was shown are written in the same
 *   transaction as the run row, so what the owner reads on the ticket page is exactly what the
 *   reviewer got. The worktree is prepared first, like a writer's (tick/prep-jobs): a slow install
 *   returns false and a failed step parks the ticket from Verifying for the owner.
 *
 * Exports: startChecks().
 * Depends on: @forge/core (ArtifactKind, stageInputs), domain/harness-choice, tick/{agent-fallback,dispatch-park,launch-run,prep-jobs,project-runtime,
 *   run-agent,stage-artifacts,stage-prompt,stage-records,stage-state,verify-outcomes}. IO: git diff, storage, driver.
 */

import { ArtifactKind, stageInputs } from '@forge/core';
import type { AgentStage, Project, StorageTx } from '@forge/core';
import { chooseHarness } from '#/domain/harness-choice.js';
import { slottedAgent } from '#/tick/agent-fallback.js';
import { parkForSetup } from '#/tick/dispatch-park.js';
import { launchRun } from '#/tick/launch-run.js';
import { ensurePrepared, prepPaths } from '#/tick/prep-jobs.js';
import { startRefFor } from '#/tick/base-sync.js';
import { driverFor, runtimeFor } from '#/tick/project-runtime.js';
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
    await startRefFor(ctx, runtime, project.slug),
  );

  // The tree must be ready for a reviewer too (it may run the project's tools): same job as a writer's.
  const ready = await ensurePrepared(ctx, runtime, ticket, wt, ticket.branch, (failure) =>
    parkForSetup(ctx, ticket, failure, writer),
  );

  if (ready !== 'ready') {
    return false;
  }

  const pathPrepend = await prepPaths(runtime, wt.path);
  const diff = (await runtime.worktrees.diff(wt.path, wt.baseSha)).patch;
  const settings = projectSettings(ctx.config, project.slug);
  let started = false;
  let wake = c.wake;

  // Only the member the scheduler placed starts (a lone check has one member); each further member
  // of a group has a wake of its own and is placed against the Worker limits like any other run.
  const due = cursor.members.filter((m) => m.stage.kind === 'agent');
  const placed =
    c.member === undefined ? due.slice(0, 1) : due.filter((m) => m.id === c.member);

  for (const m of placed) {
    if (m.stage.kind !== 'agent') {
      continue;
    }

    const stage: AgentStage = m.stage;
    const plain = resolveStageAgent(ctx.config, project.slug, stage.agent);
    const agent =
      plain && slottedAgent(ctx, project.slug, plain, state, cursor.stage.id, m.id);

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
      pathPrepend,
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
