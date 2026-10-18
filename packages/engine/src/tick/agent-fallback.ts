/**
 * Agent fallback: what a stage does when the place its agent runs keeps failing.
 *
 * Why: a run can fail for reasons that say nothing about the work: the model is rate-limited past its
 *   retries, or does not exist on this harness any more. The owner listed where else the agent may run
 *   (d-0080, d-0153), and the fourth step of the ladder is the Director's substitute. This is the engine side
 *   of the second step: after the retries of one place are spent (or at once for a model that cannot be
 *   served), the stage moves to the next usable entry of the agent's own list, in the owner's order, never one
 *   already tried in this attempt, never a parked or missing harness, and for a critic never the Worker's own
 *   model family once two families are connected (d-0073). The entry is written on the stage row (so a restart
 *   resumes on it and the strip says what ran) and a wake queues the retry at once. When nothing is left the
 *   caller parks the ticket with the `no_agent_available` failure, owner-only when the agent's `on_exhausted`
 *   says pause; the Director looks first otherwise (tick/escalation-substitute-step). A quota stop is not
 *   handled here: the harness waits for its reset as before.
 *
 * Exports: slotFor(), slottedAgent(), nextSlotTx(), connectedFamilies().
 * Depends on: @forge/core (nextFallback, isCritic, modelFamilyOf), tick/{card-log,escalation-raise,run-agent,
 *   stage-records,ticket-moves,wakes}. Writes inside the caller's transaction.
 */

import { isCritic, modelFamilyOf, nextFallback, classifyStage } from '@forge/core';
import type {
  ErrorFamily,
  Run,
  StageRun,
  StorageTx,
  Ticket,
  TicketPipeline,
} from '@forge/core';
import { agentChain, agentViews, resolveStageAgent, withSlot } from '#/tick/run-agent.js';
import { requestStageWake } from '#/tick/stage-records.js';
import { requestWakeTx } from '#/tick/wakes.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { SlotMove } from '#/types/agent-fallback.types.js';
import type { ResolvedAgent } from '#/types/run-agent.types.js';

const MAX_TRIED = 8;

/**
 * The entry of its chain the stage's next attempt uses: the one written on the row, else -1 when the Director
 * swapped the agent in for a failed one, else 0 (the agent's own).
 */
export function slotFor(
  snapshot: Pick<TicketPipeline, 'adjustments'>,
  row: Pick<StageRun, 'outcome'> | undefined,
  stageId: string,
  memberId: string,
): number {
  if (row?.outcome.fallback) {
    return row.outcome.fallback.slot;
  }

  const swapped = snapshot.adjustments.some(
    (a) =>
      a.status === 'applied' &&
      a.cause === 'fallback' &&
      a.op.op === 'swap' &&
      a.op.stage_id === stageId &&
      (a.op.member_id ?? '') === memberId,
  );

  return swapped ? -1 : 0;
}

/** `agent` on the entry its stage's current attempt is on (reads the stage row of the cycle, if it has one). */
export function slottedAgent(
  ctx: Pick<EngineCtx, 'config'>,
  slug: string,
  agent: ResolvedAgent,
  state: {
    readonly snapshot: TicketPipeline;
    readonly records: readonly StageRun[];
    readonly cycle: number;
  },
  stageId: string,
  memberId = '',
): ResolvedAgent {
  const row = state.records.find(
    (r) => r.stage_id === stageId && r.member_id === memberId && r.cycle === state.cycle,
  );

  return withSlot(
    ctx.config,
    slug,
    agent,
    slotFor(state.snapshot, row, stageId, memberId),
  );
}

/** The distinct model families the installed harnesses declare; a driver that cannot list its models adds none. */
export async function connectedFamilies(ctx: Pick<EngineCtx, 'deps'>): Promise<string[]> {
  const families = new Set<string>();
  for (const id of ctx.deps.drivers.ids()) {
    try {
      for (const m of (await ctx.deps.drivers.get(id)?.models()) ?? []) {
        families.add(modelFamilyOf({ kind: 'model', id: m.id }));
      }
    } catch {
      // A driver that cannot list its models adds no family.
    }
  }

  return [...families].sort();
}

/** The model families of the ticket's writers, from its copy and the roles it recorded. */
function writerFamilies(
  ctx: Pick<EngineCtx, 'config'>,
  slug: string,
  snapshot: TicketPipeline,
): Set<string> {
  const views = agentViews(ctx.config, slug);
  const agents = snapshot.definition.stages.flatMap((s) => {
    const klass = classifyStage(s, snapshot.roles);
    if (klass === 'writer' && s.kind === 'agent') {
      return [s.agent];
    }

    return klass === 'writer_group' && s.kind === 'group'
      ? s.members.flatMap((m) => (m.kind === 'agent' ? [m.agent] : []))
      : [];
  });

  return new Set(
    agents.flatMap((a) => {
      const v = views.find((x) => x.id === a);

      return v ? [modelFamilyOf(v.definition.runs_on.model)] : [];
    }),
  );
}

/**
 * Moves the failed attempt `row` (of `run`) to the next usable entry of its agent's chain, or says nothing is
 * left. On a move the row keeps its `error` status with the new entry and the entries tried written on it, and
 * the retry is queued now (a `retry` wake for a writer, a `stage` wake for a check), outside the hourly cap
 * (the chain bounds it). `family` is the failure that ended the run.
 */
export async function nextSlotTx(
  ctx: EngineCtx,
  tx: StorageTx,
  ticket: Ticket,
  run: Run,
  row: StageRun,
  family: ErrorFamily,
): Promise<SlotMove> {
  const slug = (await tx.projects.get(ticket.project))?.slug ?? ticket.project;
  const snapshot = await tx.ticketPipelines.get(ticket.id);
  const agent =
    row.agent_id === undefined ? null : resolveStageAgent(ctx.config, slug, row.agent_id);

  if (!agent || !snapshot) {
    return { kind: 'exhausted', pause: false, tried: [] };
  }

  const chain = agentChain(ctx.config, slug, agent);
  const current = Math.max(0, run.fallback_slot ?? row.outcome.fallback?.slot ?? 0);
  const here = chain[current];
  const before = row.outcome.fallback?.tried ?? [];
  const tried = [
    ...before.filter((t) => t.slot !== current),
    {
      slot: current,
      harness: run.harness,
      ...(run.model === undefined ? {} : { model: run.model }),
      family: modelFamilyOf(here?.model ?? { kind: 'forge_default' }),
    },
  ].slice(-MAX_TRIED);

  const paused: Record<string, { until: number }> = {};
  for (const s of await tx.harnessState.list()) {
    paused[s.harness_id] = { until: Date.parse(s.paused_until) };
  }

  const view = agentViews(ctx.config, slug).find((v) => v.id === agent.id);
  const guarded =
    view !== undefined && isCritic(view) && (await connectedFamilies(ctx)).length >= 2;

  const workers = guarded ? writerFamilies(ctx, slug, snapshot) : new Set<string>();
  const next = nextFallback({
    chain,
    tried: tried.map((t) => t.slot),
    paused,
    installed: (h) => ctx.deps.drivers.get(h) !== null,
    now: ctx.now,
    familyGuard: (e) => !guarded || !workers.has(modelFamilyOf(e.model)),
  });

  if (next === null) {
    await tx.stageRuns.finish(row.id, {
      status: 'error',
      outcome: { ...row.outcome, fallback: { slot: current, tried } },
    });

    return {
      kind: 'exhausted',
      pause: agent.definition.runs_on.on_exhausted === 'pause',
      tried,
    };
  }

  await tx.stageRuns.finish(row.id, {
    status: 'error',
    outcome: { ...row.outcome, fallback: { slot: next, tried } },
  });

  const reason = `fallback:${next}:${family}`;
  if (row.kind === 'agent' && ticket.status === 'verifying') {
    await requestStageWake(
      ctx,
      tx,
      ticket.id,
      row.stage_id,
      row.cycle,
      reason,
      undefined,
      row.member_id,
    );
  } else {
    await requestWakeTx(tx, ctx.deps, {
      ticketId: ticket.id,
      kind: 'retry',
      reason,
      key: run.id,
      uncapped: true,
    });
  }

  return { kind: 'moved', slot: next };
}
