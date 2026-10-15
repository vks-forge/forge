/**
 * The Director engine: one writer that turns intake into runs and runs into ticket state.
 *
 * Why: the Director's guarantee is that no ticket is silently lost and no run is started
 *   twice. That rests on a single place where the sequence is decided. Each tick runs
 *   reconcile (restart, stalls, finished runs, expired questions), refresh (triage new
 *   tickets, deliver steering replies), verify (publish, gate and merge finished work),
 *   then dispatch (start what is ready), and ends with
 *   the invariant sweep. Ticks are single-flight, and the engine owns no timers: the app
 *   calls `tick()` on its clock and whenever the engine asks through `onTickRequested`
 *   (an intake event, a run event, a settled run), so the same code runs under a real
 *   scheduler and under a test that moves a fake clock by hand (director-core.md §2-§3).
 *
 * Exports: createEngine().
 * Depends on: tick/* phases, types/engine, types/engine-state. IO only through EngineDeps ports.
 */

import { TERMINAL_STATUSES } from '@forge/core';
import type { Ticket } from '@forge/core';
import { iso } from '#/shared/time.js';
import { dispatchReady } from '#/tick/dispatch.js';
import { explainWait } from '#/tick/explain.js';
import { answerInteraction, expireInteractions } from '#/tick/interactions.js';
import { ingest } from '#/tick/intake.js';
import { interruptRun } from '#/tick/interrupt.js';
import { cancelStalled, settleFinishedPumps } from '#/tick/reconcile.js';
import { reconcileRestart, resumeInterrupted } from '#/tick/restart.js';
import { deliverReplies } from '#/tick/steering.js';
import { beginTick, endTick, requestTick } from '#/tick/tick-requests.js';
import { moveTicket } from '#/tick/ticket-moves.js';
import { loadTickConfig } from '#/tick/tick-config.js';
import { triageInbox } from '#/tick/triage.js';
import { verifyReady } from '#/tick/verify.js';
import { checkInvariants } from '#/tick/violations.js';
import type { EngineCtx, EngineState } from '#/types/engine-state.types.js';
import type { Engine, EngineDeps, TickReport } from '#/types/engine.types.js';
import type { TickConfig } from '#/types/tick.types.js';

function emptyReport(nowIso: string, firstTick: boolean): TickReport {
  return {
    at: nowIso,
    firstTick,
    crashed: [],
    resumed: [],
    resumeFailed: [],
    settled: [],
    triaged: [],
    dispatched: [],
    steered: [],
    verified: [],
    parked: [],
    violations: [],
    rejectedSteps: [],
    errors: [],
  };
}

/** Runs one phase; a throw becomes a report error so one bad phase never blocks the others. */
async function phase(
  ctx: EngineCtx,
  where: string,
  fn: (c: EngineCtx) => Promise<void>,
): Promise<void> {
  try {
    await fn(ctx);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    ctx.report.errors.push({ where, message });
    ctx.deps.log?.('error', `${where} failed`, { error: message });
  }
}

async function runTick(deps: EngineDeps, state: EngineState): Promise<TickReport> {
  const now = deps.clock.now();
  const report = emptyReport(iso(now), state.firstTick);
  beginTick(state);

  // One read of the settings for the whole tick. If they cannot be read (or a stored
  // company override no longer validates) nothing is decided on a guess: the tick is skipped and
  // the error is reported, and the next tick tries again (d-0085).
  let config: TickConfig;
  try {
    config = await loadTickConfig(deps);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    report.errors.push({ where: 'load config', message });
    deps.log?.('error', 'load config failed', { error: message });

    return report;
  }

  // A project whose settings do not validate is skipped by triage, verify, dispatch and
  // resume; the others carry on. It is reported here and through `unservableProjects()`.
  state.unservable = config.unservable;
  for (const [slug, reason] of config.unservable) {
    report.errors.push({ where: `project config ${slug}`, message: reason });
    deps.log?.('error', `project ${slug} is unservable: its settings are invalid`, {
      error: reason,
    });
  }

  const ctx: EngineCtx = { deps, state, report, config, now, nowIso: iso(now) };
  if (state.firstTick) {
    await phase(ctx, 'restart reconcile', reconcileRestart);
    state.firstTick = false;
  }

  await phase(ctx, 'resume interrupted runs', resumeInterrupted);

  await phase(ctx, 'settle runs', settleFinishedPumps);
  await phase(ctx, 'stall scan', cancelStalled);
  await phase(ctx, 'expire interactions', expireInteractions);
  await phase(ctx, 'deliver replies', deliverReplies);
  await phase(ctx, 'triage', triageInbox);
  await phase(ctx, 'verify', verifyReady);
  await phase(ctx, 'dispatch', dispatchReady);
  await phase(ctx, 'invariants', checkInvariants);

  return ctx.report;
}

/** Builds an engine over its ports. Nothing starts until the app calls `tick()`. */
export function createEngine(deps: EngineDeps): Engine {
  const state: EngineState = {
    firstTick: true,
    running: null,
    requested: false,
    notified: false,
    pumps: new Map(),
    schedulerCursor: undefined,
    unservable: new Map(),
    holds: new Map(),
    baseShas: new Map(),
    gateJobs: new Map(),
    regates: new Map(),
    replies: [],
  };

  const engine: Engine = {
    tick() {
      if (state.running) {
        return state.running;
      }

      const tick = runTick(deps, state).finally(() => endTick(deps, state));
      state.running = tick;

      return tick;
    },
    requestTick: () => requestTick(deps, state),
    ingest: (event) => ingest(deps, state, event),
    answerInteraction: (id, answer) => answerInteraction(deps, state, id, answer),
    async cancelTicket(ticketId) {
      const nowIso = iso(deps.clock.now());
      const moved = await moveTicket(deps.storage, ticketId, nowIso, (t: Ticket) =>
        TERMINAL_STATUSES.includes(t.status) ? null : { events: [{ type: 'cancelled' }] },
      );

      if (!moved.ok) {
        return false;
      }

      const runId = moved.ticket.assignee_run_id;
      const pump = runId ? state.pumps.get(runId) : undefined;
      if (pump) {
        pump.cancelled = true;
        await pump.driver.cancel(pump.handle).catch((e: unknown) => {
          deps.log?.('error', `cancel of ${pump.runId} failed`, { error: String(e) });
        });
      }

      const settings = await deps.config
        .project(moved.ticket.project)
        .catch(() => undefined);

      const runtime = deps.project(moved.ticket.project, settings);
      if (moved.ticket.worktree && runtime) {
        await runtime.worktrees.remove(moved.ticket.worktree).catch((e: unknown) => {
          deps.log?.('warn', `could not remove worktree of ${ticketId}`, {
            error: String(e),
          });
        });
      }

      requestTick(deps, state);

      return true;
    },
    explainWait: (ticketId) => explainWait(deps, state, ticketId),
    interruptRun: (runId) => interruptRun(deps, state, runId),
    liveRunIds: () => [...state.pumps.keys()],
    unservableProjects: () => new Map(state.unservable),
    gateJobsInFlight: () =>
      [...state.gateJobs.values()].filter((j) => j.outcome === undefined).length,
  };

  return engine;
}
