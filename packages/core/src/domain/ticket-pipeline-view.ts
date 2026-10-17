/**
 * Ticket pipeline view — the strip the ticket page draws, rolled up from stage rows.
 *
 * Why: the owner wants to see at a glance where a ticket is: which stages passed, which one is
 *   running, how many reworks it has used, which checks a rule added. The rows hold every
 *   attempt of every cycle, so the view picks, for each stage, the attempt that matters now:
 *   the one in the current cycle, or the earlier pass that still stands. A stage the current
 *   cycle has not reached again reads as pending, not as the failure that sent work back. A
 *   group rolls its members up; the artifacts listed are what each stage was shown or made,
 *   fetched one by one by id so the strip stays small.
 *
 * Exports: ticketPipelineView().
 * Depends on: domain/stage-cursor, schemas/pipeline, schemas/stage-run, schemas/ticket,
 *   types/pipeline-rules, types/stage-view. No IO.
 */

import { MAX_AUTO_REWORKS } from '#/domain/state-machine.js';
import { currentCycle, cycleStart } from '#/domain/stage-cursor.js';
import type { Severity, Stage } from '#/schemas/pipeline.js';
import type {
  StageArtifact,
  StageRun,
  StageRunStatus,
  TicketPipeline,
  TicketPipelineView,
} from '#/schemas/stage-run.js';
import type { Ticket } from '#/schemas/ticket.js';
import type { RosterEntry } from '#/types/pipeline-rules.types.js';
import type { StageView, ViewContext } from '#/types/stage-view.types.js';

const SEVERITIES: readonly Severity[] = ['critical', 'high', 'medium', 'low'];

/** The newest attempt of (stage, member), whatever the cycle. */
function latest(
  records: readonly StageRun[],
  stageId: string,
  member: string,
): StageRun | undefined {
  return records
    .filter((r) => r.stage_id === stageId && r.member_id === member)
    .sort((a, b) => b.cycle - a.cycle || b.id - a.id)[0];
}

const kindOf = (stage: Stage): StageView['kind'] => stage.kind;

/** One group's status from its members': a failure outranks a run, a run outranks waiting. */
function rollUp(members: readonly StageView[]): StageRunStatus | 'pending' {
  const statuses = members.map((m) => m.status);
  for (const s of ['failed', 'error', 'running', 'waiting'] as const) {
    if (statuses.includes(s)) {
      return s;
    }
  }

  if (statuses.every((s) => s === 'passed' || s === 'adopted' || s === 'skipped')) {
    return statuses.every((s) => s === 'adopted') ? 'adopted' : 'passed';
  }

  return statuses.some((s) => s !== 'pending') ? 'running' : 'pending';
}

/** The view of one leaf stage (an agent, a gate, the human or merge stage, or a group member). */
function leaf(
  stage: Stage,
  member: string,
  parent: string,
  ctx: ViewContext,
  agentOf: (stage: Stage) => StageView['agent'],
): StageView {
  const id = parent === '' ? stage.id : parent;
  const row = latest(ctx.records, id, member);
  // An attempt from before the current cycle only counts when this stage is not run again in it.
  // A failed or held attempt stays visible: it is why the ticket went back.
  const stale =
    row !== undefined &&
    row.cycle < ctx.cycle &&
    ctx.rerun.has(id) &&
    !['adopted', 'failed', 'waiting'].includes(row.status);

  const shown = stale ? undefined : row;
  const counts = shown?.outcome.review
    ? (Object.fromEntries(
        SEVERITIES.map((s) => [
          s,
          shown.outcome.review?.findings.filter((f) => f.severity === s).length ?? 0,
        ]),
      ) as Record<Severity, number>)
    : undefined;

  const summary = shown?.outcome.review?.summary ?? shown?.outcome.note;
  const agent = agentOf(stage);
  const rows = ctx.records.filter(
    (r) =>
      r.stage_id === id && r.member_id === member && (!shown || r.cycle === shown.cycle),
  );

  return {
    id: stage.id,
    kind: kindOf(stage),
    label: stage.label,
    ...(agent ? { agent } : {}),
    status: shown?.status ?? 'pending',
    cycle: shown?.cycle ?? ctx.cycle,
    ...(shown?.run_id ? { run_id: shown.run_id } : {}),
    ...(shown ? { started_at: shown.started_at } : {}),
    ...(shown?.ended_at ? { ended_at: shown.ended_at } : {}),
    ...(summary ? { summary } : {}),
    ...(counts ? { counts } : {}),
    artifacts: ctx.artifacts
      .filter((a) => rows.some((r) => r.id === a.stage_run_id))
      .map((a) => ({ id: a.id, kind: a.kind })),
  };
}

/**
 * The strip for one ticket: a view per stage in pipeline order, the routed stages, and the
 * rework count against its cap.
 */
export function ticketPipelineView(
  snapshot: TicketPipeline,
  records: readonly StageRun[],
  artifacts: readonly Pick<StageArtifact, 'id' | 'stage_run_id' | 'kind'>[],
  ticket: Pick<Ticket, 'rework_count' | 'status'>,
  roster: readonly RosterEntry[],
): TicketPipelineView {
  const names = new Map(roster.map((e) => [e.id, e.definition.name]));
  const cycle = currentCycle(records);
  const start = cycleStart(snapshot, records, cycle);
  const { stages } = snapshot.definition;
  const rerun = new Set(stages.filter((_, i) => i >= start).map((s) => s.id));
  const ctx: ViewContext = { records, artifacts, cycle, rerun };
  const agentOf = (s: Stage): StageView['agent'] =>
    s.kind === 'agent' ? { id: s.agent, name: names.get(s.agent) ?? s.agent } : undefined;

  const views = stages.map((stage): StageView => {
    if (stage.kind === 'merge') {
      // Merge leaves no row of its own: it has passed exactly when the ticket is done.
      return {
        ...leaf(stage, '', '', ctx, agentOf),
        status: ticket.status === 'done' ? 'passed' : 'pending',
      };
    }

    if (stage.kind !== 'group') {
      return leaf(stage, '', '', ctx, agentOf);
    }

    const members = stage.members.map((m) => leaf(m, m.id, stage.id, ctx, agentOf));

    return {
      id: stage.id,
      kind: 'group',
      label: stage.label,
      members,
      status: rollUp(members),
      cycle: Math.max(cycle, ...members.map((m) => m.cycle)),
      artifacts: members.flatMap((m) => m.artifacts),
    };
  });

  return {
    lane: snapshot.lane,
    hash: snapshot.hash,
    config_version: snapshot.config_version,
    stages: views,
    routed: snapshot.routed,
    rework: { count: ticket.rework_count, cap: MAX_AUTO_REWORKS },
  };
}
