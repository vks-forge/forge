/**
 * Scorecards — how each agent and each pipeline shape has been doing, computed from rows.
 *
 * Why: assigning an agent to a stage, or deciding whether a lane's list is right, needs a track record
 *   (d-0081), and the owner should read the same numbers the Director reads. Everything here is computed
 *   on read and never stored or applied: no figure changes a default or an assignment by itself. A figure
 *   with no data is null (never a flattering zero), a run with no recorded cost widens the coverage gap
 *   instead of being priced by guess (as `cost-rollup`), and a row built on fewer than five tickets says so.
 *   The window is the tickets last touched in the last 30 or 90 days (first instant included), so a ticket
 *   that finished yesterday counts whenever it began. An agent "took part" in a ticket when one of its
 *   agent stage rows ran (adopted and skipped rows do not count); finished means the ticket is done.
 *
 * Exports: computeScorecards(), compactScorecards().
 * Depends on: domain/{scorecard-findings,stage-kinds,stats-window}, schemas/{run,scorecard,stage-run}, types/scorecard-input. No IO.
 */

import { tallyFindings } from '#/domain/scorecard-findings.js';
import { isCheckRole, isWriterRole } from '#/domain/stage-kinds.js';
import { durationStats, rateStat } from '#/domain/stats-window.js';
import type { Run } from '#/schemas/run.js';
import { MIN_SCORECARD_TICKETS, SCORECARD_SLICES } from '#/schemas/scorecard.js';
import type {
  AgentScorecard,
  ScorecardReply,
  ScorecardRow,
  ScorecardSlice,
  ShapeScorecard,
} from '#/schemas/scorecard.js';
import type { StageRun } from '#/schemas/stage-run.js';
import type {
  ScorecardInput,
  ScorecardSnapshot,
  ScorecardTicket,
} from '#/types/scorecard-input.types.js';
import type { ScorecardFacts, ScorecardSubject } from '#/types/scorecard.types.js';

const DAY_MS = 86_400_000;
const RANGE_DAYS = { '30d': 30, '90d': 90 } as const;
const LANE_LABEL = { express: 'Express', standard: 'Standard', full: 'Full' } as const;

const tierOf = (t: ScorecardTicket): string => t.tier_actual ?? t.tier_predicted;

const sliceValue = (slice: ScorecardSlice, t: ScorecardTicket): string | undefined =>
  slice === 'type'
    ? t.type
    : slice === 'tier'
      ? tierOf(t)
      : slice === 'lane'
        ? t.lane
        : undefined;

/** Share of groups of one agent's rows whose first finished verdict passed the first time. */
function passRate(rows: readonly StageRun[]): ScorecardRow['pass_rate'] {
  const groups = new Map<string, StageRun[]>();
  for (const r of rows) {
    if (['passed', 'failed', 'waiting'].includes(r.status)) {
      const key = `${r.ticket_id}|${r.stage_id}|${r.member_id}`;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
  }

  if (groups.size === 0) {
    return null;
  }

  const first = [...groups.values()].map(
    (g) => [...g].sort((a, b) => a.cycle - b.cycle)[0],
  );

  return rateStat(first.filter((r) => r?.status === 'passed').length, groups.size);
}

function costOf(runs: readonly Run[], tickets: number): ScorecardRow['cost'] {
  const withCost = runs.filter((r) => r.cost_usd !== undefined);
  const total = withCost.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);

  return {
    total_usd: total,
    per_ticket_usd: withCost.length === 0 || tickets === 0 ? null : total / tickets,
    coverage: rateStat(withCost.length, runs.length),
  };
}

function buildRow(
  by: ScorecardSlice,
  value: string | undefined,
  s: ScorecardSubject,
  input: ScorecardInput,
): ScorecardRow {
  const tickets = s.facts.length;
  const finished = s.facts.filter((f) => f.ticket.status === 'done');
  const writerLike = s.kind !== 'check';
  const durations = s.runs.flatMap((r) =>
    r.ended_at === undefined ? [] : [Date.parse(r.ended_at) - Date.parse(r.started_at)],
  );

  return {
    by,
    ...(value === undefined ? {} : { value }),
    tickets,
    runs: s.runs.length,
    insufficient: tickets < MIN_SCORECARD_TICKETS,
    clean_rate:
      writerLike && finished.length > 0
        ? rateStat(
            finished.filter((f) => f.ticket.rework_count === 0).length,
            finished.length,
          )
        : null,
    pass_rate: s.kind === 'check' ? passRate(s.rows) : null,
    reworks_per_ticket:
      finished.length === 0
        ? null
        : finished.reduce((sum, f) => sum + f.ticket.rework_count, 0) / finished.length,
    holds: s.rows.filter((r) => r.status === 'waiting' && r.kind !== 'human').length,
    overrides: s.rows.filter((r) => r.outcome.override !== undefined).length,
    cost: costOf(s.runs, tickets),
    duration: durationStats(durations),
    fallback_runs: s.runs.filter(
      (r) => r.fallback_slot !== undefined && r.fallback_slot !== 0,
    ).length,
    substituted: s.substituted,
    ...(s.kind === 'writer'
      ? {}
      : {
          findings: tallyFindings(
            s.rows.filter((r) => r.outcome.review !== undefined),
            s.facts.flatMap((f) => f.rows),
            input.marks,
          ),
        }),
  };
}

/** The `all` row, then one row per value present in each of the type, tier and lane slices. */
function rowsFor(s: ScorecardSubject, input: ScorecardInput): ScorecardRow[] {
  const subjectOf = (facts: readonly ScorecardFacts[]): ScorecardSubject => {
    const ids = new Set(facts.map((f) => f.ticket.id));
    const own = (r: { readonly ticket_id: string }): boolean =>
      ids.has(r.ticket_id as never);

    return { ...s, facts, rows: s.rows.filter(own), runs: s.runs.filter(own) };
  };

  const out = [buildRow('all', undefined, s, input)];
  for (const slice of SCORECARD_SLICES.filter((x) => x !== 'all')) {
    const values = [
      ...new Set(s.facts.flatMap((f) => sliceValue(slice, f.ticket) ?? [])),
    ].sort();

    for (const value of values) {
      const facts = s.facts.filter((f) => sliceValue(slice, f.ticket) === value);
      out.push(buildRow(slice, value, subjectOf(facts), input));
    }
  }

  return out;
}

const fallbackSwaps = (snap: ScorecardSnapshot | undefined) =>
  (snap?.adjustments ?? []).filter(
    (a) => a.cause === 'fallback' && a.status === 'applied' && a.op.op === 'swap',
  );

/** "Standard", or "Standard + security-reviewer" when the Director changed the list. */
function shapeLabel(snap: ScorecardSnapshot): string {
  const parts = snap.adjustments
    .filter((a) => a.status === 'applied')
    .map((a) => {
      switch (a.op.op) {
        case 'add':
          return `+ ${a.op.stage.kind === 'agent' ? a.op.stage.agent : a.op.stage.id}`;
        case 'remove':
          return `- ${a.op.stage_id}`;
        case 'swap':
          return `${a.op.stage_id} -> ${a.op.agent}`;
        case 'move':
          return `move ${a.op.stage_id}`;
      }
    });

  return [LANE_LABEL[snap.lane], ...parts].join(' ');
}

/** Scorecards of every agent in the roster (and any agent seen in the rows) and of every pipeline shape run. */
export function computeScorecards(input: ScorecardInput): ScorecardReply {
  const from = input.now - RANGE_DAYS[input.range] * DAY_MS;
  const inWindow = input.tickets.filter((t) => {
    const at = Date.parse(t.updated_at);

    return at >= from && at <= input.now;
  });

  const snapshots = new Map(input.snapshots.map((s) => [s.ticket_id as string, s]));
  const facts: ScorecardFacts[] = inWindow.map((ticket) => ({
    ticket,
    snapshot: snapshots.get(ticket.id),
    rows: input.rows.filter((r) => r.ticket_id === ticket.id),
    runs: input.runs.filter((r) => r.ticket_id === ticket.id),
  }));

  const took = (r: StageRun): boolean =>
    r.kind === 'agent' &&
    r.agent_id !== undefined &&
    !['adopted', 'skipped'].includes(r.status);

  const known = new Map(input.roster.map((e) => [e.id, e.definition] as const));
  const seen = new Map<string, { name: string; role: AgentScorecard['role'] }>();
  for (const f of facts) {
    for (const r of f.rows.filter(took)) {
      const id = r.agent_id as string;
      const role = known.get(id)?.role ?? f.snapshot?.roles[id];
      if (!known.has(id) && role !== undefined) {
        seen.set(id, { name: id, role });
      }
    }
  }

  const agents: AgentScorecard[] = [
    ...input.roster.map((e) => ({
      id: e.id,
      name: e.definition.name,
      role: e.definition.role,
    })),
    ...[...seen].map(([id, v]) => ({ id, ...v })),
  ].map((a) => {
    const mine = facts.filter((f) => f.rows.some((r) => took(r) && r.agent_id === a.id));
    const ids = new Set(mine.map((f) => f.ticket.id));
    const subject: ScorecardSubject = {
      facts: mine,
      rows: mine.flatMap((f) => f.rows.filter((r) => took(r) && r.agent_id === a.id)),
      runs: mine.flatMap((f) =>
        f.runs.filter((r) => r.agent_id === a.id && ids.has(r.ticket_id as never)),
      ),
      kind: isWriterRole(a.role) ? 'writer' : isCheckRole(a.role) ? 'check' : 'writer',
      substituted: mine.filter((f) =>
        fallbackSwaps(f.snapshot).some((x) => x.op.op === 'swap' && x.op.agent === a.id),
      ).length,
    };

    return { agent_id: a.id, name: a.name, role: a.role, rows: rowsFor(subject, input) };
  });

  const byHash = new Map<string, ScorecardFacts[]>();
  for (const f of facts) {
    if (f.snapshot) {
      byHash.set(f.snapshot.hash, [...(byHash.get(f.snapshot.hash) ?? []), f]);
    }
  }

  const shapes: ShapeScorecard[] = [...byHash].map(([hash, group]) => {
    const snap = group[0]?.snapshot as ScorecardSnapshot;
    const subject: ScorecardSubject = {
      facts: group,
      rows: group.flatMap((f) => f.rows),
      runs: group.flatMap((f) => f.runs),
      kind: 'shape',
      substituted: group.filter((f) => fallbackSwaps(f.snapshot).length > 0).length,
    };

    return {
      hash,
      lane: snap.lane,
      label: shapeLabel(snap),
      stages: snap.definition.stages.map((s) => s.id),
      director_changed: snap.hash !== snap.base_hash,
      rows: rowsFor(subject, input),
    };
  });

  return {
    range: input.range,
    agents,
    shapes,
    computed_at: new Date(input.now).toISOString(),
  };
}

/**
 * The compact form the Director reads: agents that took part in something, each with its `all` row and the
 * rows of the ticket types asked for.
 */
export function compactScorecards(
  reply: ScorecardReply,
  types: readonly string[],
): AgentScorecard[] {
  return reply.agents
    .filter((a) => (a.rows.find((r) => r.by === 'all')?.tickets ?? 0) > 0)
    .map((a) => ({
      ...a,
      rows: a.rows.filter(
        (r) => r.by === 'all' || (r.by === 'type' && types.includes(r.value ?? '')),
      ),
    }));
}
