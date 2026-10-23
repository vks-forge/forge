/**
 * The Director's look at a stage that ran out of places to run: the `pick_substitute` step.
 *
 * Why: when an agent and every fallback the owner listed have failed, the fourth step of the ladder is a
 *   substitute (d-0080): another agent for that one stage. The engine, not the model, decides who may be named:
 *   candidates are built by core `substituteCandidates` (same role, usable, harness ready now, a writer's
 *   scope within the original's, not an agent that would check work it wrote, a critic off the Worker's
 *   family once two are connected) and handed over with each one's scorecard. The tool-less step may pick one
 *   or pause; a pick outside the list, a pause, a step error, the owner's switch for the Director's pipeline
 *   changes turned off, or no candidate at all hands the item to the owner with Retry, Re-plan and Cancel. A valid
 *   pick becomes a `swap` through the one door for a ticket's pipeline copy (tick/pipeline-adjust), which
 *   re-checks every rule, in the same transaction that settles the item with the engine-only action
 *   `substitute` and releases the ticket for another try, so a restart can neither swap twice nor settle
 *   without swapping. The step runs outside any transaction (no model call holds the database), the
 *   Director's spend lands on the card as a warning only.
 *
 * Exports: lookAtNoAgent().
 * Depends on: @forge/core (substituteCandidates, computeScorecards, PickSubstituteOutput), steps/run-step,
 *   tick/{agent-fallback,card-budget,escalation-effects,escalation-raise,lane-pipeline,pipeline-adjust,
 *   planning-state,run-agent,scorecards,stage-state}. Reads and writes storage.
 */

import {
  PickSubstituteOutput,
  computeScorecards,
  modelFamilyOf,
  substituteCandidates,
} from '@forge/core';
import type {
  EscalationFailure,
  Interaction,
  PickSubstituteInput,
  RosterEntry,
  ScorecardRow,
  StageRun,
  Ticket,
} from '@forge/core';
import { rejectStep, runStep } from '#/steps/run-step.js';
import { connectedFamilies } from '#/tick/agent-fallback.js';
import { resetFallbackTx } from '#/tick/no-agent.js';
import { addDirectorSpend } from '#/tick/card-budget.js';
import { retryTx } from '#/tick/escalation-effects.js';
import { handToOwner } from '#/tick/escalation-raise.js';
import { adjustTicketPipelineTx } from '#/tick/pipeline-adjust.js';
import { directorFor } from '#/tick/planning-state.js';
import { agentViews, resolveStageAgent } from '#/tick/run-agent.js';
import { loadScorecardInput } from '#/tick/scorecards.js';
import { readStageState } from '#/tick/stage-state.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { DirectorApply } from '#/types/director-jobs.types.js';
import type { SubstituteLook } from '#/types/substitute-step.types.js';
import type { StageState } from '#/types/stage-runner.types.js';

const stageLabel = (state: StageState, row: StageRun): string => {
  const stage = state.snapshot.definition.stages.find((s) => s.id === row.stage_id);
  if (stage?.kind === 'group') {
    return `${stage.label}: ${stage.members.find((m) => m.id === row.member_id)?.label ?? row.member_id}`;
  }

  return stage?.label ?? row.stage_id;
};

async function read(ctx: EngineCtx, ticket: Ticket): Promise<SubstituteLook | null> {
  return ctx.deps.storage.transaction(async (tx) => {
    const project = await tx.projects.get(ticket.project);
    const state = await readStageState(tx, ticket.id);
    // The attempt that ran out of places is the newest errored row of the cycle that carries what was tried.
    const row = state?.records
      .filter(
        (r) =>
          r.status === 'error' &&
          r.cycle === state.cycle &&
          r.outcome.fallback !== undefined,
      )
      .sort((a, b) => b.id - a.id)[0];

    if (!project || !state || !row) {
      return null;
    }

    const paused = new Set(
      (await tx.harnessState.list())
        .filter((s) => Date.parse(s.paused_until) > ctx.now)
        .map((s) => s.harness_id),
    );

    return { slug: project.slug, state, row, paused, projectId: project.id };
  });
}

/** Looks at one director-stage `no_agent_available` failure: a substitute from the engine's list, or the owner. Returns the write for the tick to apply. */
export async function lookAtNoAgent(
  ctx: EngineCtx,
  row: Interaction,
  ticket: Ticket,
  failure: EscalationFailure,
): Promise<DirectorApply> {
  const toOwner =
    (diagnosis?: string, cost = 0, warnAt = 0): DirectorApply =>
    (tick) =>
      tick.deps.storage.transaction(async (tx) => {
        if (cost > 0) {
          await addDirectorSpend(tx, row.card_id, cost, tick.nowIso, warnAt, {
            kind: 'escalation_substitute',
            ticketId: row.ticket_id,
          });
        }

        await handToOwner(tx, tick.nowIso, row, {
          ...failure,
          ...(diagnosis === undefined ? {} : { diagnosis }),
        });
      });

  const look = await read(ctx, ticket);
  if (!look) {
    return toOwner();
  }

  const { director } = directorFor(ctx, look.slug);
  if (!director.pipelines.adjust) {
    return toOwner(
      'The Director may not change ticket pipelines (switched off in Director settings).',
    );
  }

  const { state, row: stageRow } = look;
  const failedAgent = stageRow.agent_id;
  const roster: readonly RosterEntry[] = agentViews(ctx.config, look.slug);
  const failed = roster.find((e) => e.id === failedAgent);
  if (failedAgent === undefined || !failed) {
    return toOwner();
  }

  const families = await connectedFamilies(ctx);
  const ready = (e: RosterEntry): boolean => {
    const harness = resolveStageAgent(ctx.config, look.slug, e.id)?.harnessId;

    return (
      harness !== undefined &&
      ctx.deps.drivers.get(harness) !== null &&
      !look.paused.has(harness)
    );
  };

  const candidates = substituteCandidates({
    stage: {
      id: stageRow.stage_id,
      ...(stageRow.member_id === '' ? {} : { member: stageRow.member_id }),
    },
    failedAgent,
    roster,
    snapshot: { definition: state.snapshot.definition, lane: state.snapshot.lane },
    routed: state.snapshot.routed.map((r) => r.stage_id),
    ready,
    families,
  });

  if (candidates.length === 0) {
    return toOwner(
      'No other agent can take this stage: none has the same role and a scope within the original, is ready now and may check this work.',
    );
  }

  const cards = await ctx.deps.storage.transaction(async (tx) =>
    computeScorecards(
      await loadScorecardInput(tx, {
        project: ticket.project,
        roster,
        now: ctx.now,
        range: '90d',
      }),
    ),
  );

  const cardOf = (id: string): ScorecardRow | null =>
    cards.agents.find((a) => a.agent_id === id)?.rows.find((r) => r.by === 'all') ?? null;

  const playbook = director.playbooks['pick-substitute'];
  const input: PickSubstituteInput = {
    stage: { id: stageRow.stage_id, label: stageLabel(state, stageRow) },
    failed: {
      agent_id: failedAgent,
      role: failed.definition.role,
      tried: failure.attempts.map((a) => `${a.what}: ${a.result}`),
    },
    candidates: candidates.map((c) => ({
      id: c.id,
      name: c.definition.name,
      role: c.definition.role,
      description: c.definition.description,
      write_scope: c.definition.write_scope,
      family: modelFamilyOf(c.definition.runs_on.model),
      card: cardOf(c.id),
    })),
    playbook: playbook
      ? { id: 'pick-substitute', title: playbook.title, body: playbook.body }
      : null,
    house_rules: director.house_rules,
  };

  let cost = 0;
  const result = await runStep(
    ctx,
    'pick_substitute',
    input as unknown as Record<string, unknown>,
    PickSubstituteOutput,
    {
      timeoutMs: director.step_timeouts_ms.pick_substitute,
      onCost: (usd) => {
        cost += usd;
      },
    },
  );

  if (!result.ok) {
    rejectStep(ctx, 'pick_substitute', ticket.id, result.error);

    return toOwner(undefined, cost, director.budget_warning_usd);
  }

  const pick = result.value;
  const chosen =
    pick.decision === 'substitute'
      ? candidates.find((c) => c.id === pick.agent)
      : undefined;

  if (!chosen) {
    // A pause, or a name the engine did not offer: never trusted, the owner decides.
    return toOwner(pick.reason, cost, director.budget_warning_usd);
  }

  return (tick) =>
    tick.deps.storage.transaction(async (tx) => {
      await addDirectorSpend(
        tx,
        row.card_id,
        cost,
        tick.nowIso,
        director.budget_warning_usd,
        { kind: 'escalation_substitute', ticketId: row.ticket_id },
      );

      const fresh = await tx.tickets.get(ticket.id);
      const pending = await tx.interactions.get(row.id);
      if (
        !fresh ||
        pending?.status !== 'pending' ||
        (fresh.status !== 'waiting_human' && fresh.status !== 'blocked')
      ) {
        return;
      }

      const adjusted = await adjustTicketPipelineTx(
        tx,
        tick,
        fresh,
        [
          {
            op: 'swap',
            stage_id: stageRow.stage_id,
            ...(stageRow.member_id === '' ? {} : { member_id: stageRow.member_id }),
            agent: chosen.id,
            reason: pick.reason,
          },
        ],
        'fallback',
      );

      if (adjusted.adjustments[adjusted.adjustments.length - 1]?.status !== 'applied') {
        // The door's rules refused it (the roster moved since the list was built): the owner decides.
        await handToOwner(tx, tick.nowIso, row, {
          ...failure,
          diagnosis: `The Director's pick, ${chosen.id}, could not be applied.`,
        });

        return;
      }

      // The substitute starts its own chain from its own place.
      await resetFallbackTx(tx, ticket.id);
      await retryTx(
        tick.deps,
        tx,
        tick.nowIso,
        row,
        { action: 'substitute', by: 'director', note: `${chosen.id}: ${pick.reason}` },
        'engine',
      );
    });
}
