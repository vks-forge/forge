/**
 * Turns a stored run into the Runs screen row and the run detail.
 *
 * Why: the Runs table shows more than the persisted row: the ticket it works on, the project,
 *   how long it ran (or has been running), tokens in the API's shape, and whether its harness
 *   is parked until a quota reset, which the row's status alone cannot say. The lookups that
 *   supply those (ticket titles, project slugs, parked harnesses) are the caller's, read once
 *   per request, so a page of 200 runs costs a few reads, not 200.
 *
 * Exports: loadRunContext(), summarizeRun(), detailOfRun().
 * Depends on: @forge/core (run schemas, tokensOf, isRunActive). IO: reads storage in loadRunContext().
 */

import { isRunActive, tokensOf } from '@forge/core';
import type { RunContext } from '#/types/run-context.types.js';
import type {
  GateResult,
  Run,
  RunDetail,
  RunSummary,
  StorageTx,
  Ticket,
  TokenTotals,
} from '@forge/core';

/** Reads what `summarizeRun` needs for these runs. */
export async function loadRunContext(
  tx: StorageTx,
  runs: readonly Run[],
  nowMs: number,
): Promise<RunContext> {
  const slugs = new Map((await tx.projects.list()).map((p) => [p.id, p.slug]));
  const tickets = new Map<string, { title: string; project?: string }>();

  for (const id of new Set(runs.map((r) => r.ticket_id))) {
    const t = await tx.tickets.get(id as Ticket['id']);
    if (t) {
      const project = slugs.get(t.project);
      tickets.set(id, { title: t.title, ...(project === undefined ? {} : { project }) });
    }
  }

  const nowIso = new Date(nowMs).toISOString();
  const pausedHarnesses = new Set(
    (await tx.harnessState.list())
      .filter((s) => s.paused_until > nowIso)
      .map((s) => s.harness_id),
  );

  return { nowMs, tickets, pausedHarnesses };
}

function durationOf(run: Run, nowMs: number): number | null {
  const start = Date.parse(run.started_at);
  if (run.ended_at !== undefined) {
    return Math.max(0, Date.parse(run.ended_at) - start);
  }

  return isRunActive(run) ? Math.max(0, nowMs - start) : null;
}

export function summarizeRun(run: Run, ctx: RunContext): RunSummary {
  const ticket = ctx.tickets.get(run.ticket_id);
  const tokens: TokenTotals | undefined = run.usage ? tokensOf(run.usage) : undefined;

  return {
    id: run.id,
    ticket_id: run.ticket_id,
    ...(ticket ? { ticket_title: ticket.title } : {}),
    ...(ticket?.project === undefined ? {} : { project: ticket.project }),
    harness: run.harness,
    lane: run.lane,
    status: run.status,
    started_at: run.started_at,
    ...(run.ended_at === undefined ? {} : { ended_at: run.ended_at }),
    duration_ms: durationOf(run, ctx.nowMs),
    generation: run.generation ?? 1,
    ...(run.retry_of === undefined ? {} : { retry_of: run.retry_of }),
    ...(run.error_family === undefined ? {} : { error_family: run.error_family }),
    paused_harness: run.ended_at === undefined && ctx.pausedHarnesses.has(run.harness),
    ...(run.cost_usd === undefined ? {} : { cost_usd: run.cost_usd }),
    ...(tokens ? { tokens } : {}),
  };
}

/** The detail view: the summary plus the fields a person debugging one run needs. */
export function detailOfRun(
  run: Run,
  ctx: RunContext,
  gates: readonly GateResult[],
): RunDetail {
  const byModel = run.usage?.byModel;

  return {
    ...summarizeRun(run, ctx),
    cwd: run.cwd,
    driver_version: run.driver_version,
    owner: run.owner,
    ...(run.session_ref === undefined ? {} : { session_ref: run.session_ref }),
    ...(run.last_event_at === undefined ? {} : { last_event_at: run.last_event_at }),
    ...(run.interrupted_at === undefined ? {} : { interrupted_at: run.interrupted_at }),
    ...(run.config_version === undefined ? {} : { config_version: run.config_version }),
    ...(byModel
      ? {
          tokens_by_model: Object.fromEntries(
            Object.entries(byModel).map(([model, u]) => [model, tokensOf(u)]),
          ),
        }
      : {}),
    gates: [...gates],
  };
}
