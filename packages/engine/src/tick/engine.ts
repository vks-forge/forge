/**
 * The Director engine: one writer that turns intake into runs and runs into ticket state.
 *
 * Why: the Director's guarantee is that no ticket is silently lost and no run is started
 *   twice. That rests on a single place where the sequence is decided. Each tick runs
 *   reconcile (restart, stalls, finished runs, expired questions), refresh (triage new
 *   tickets, deliver steering replies), then dispatch (start what is ready), and ends with
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
import { answerInteraction, expireInteractions } from '#/tick/interactions.js';
import { ingest } from '#/tick/intake.js';
import {
  cancelStalled,
  crashForeignRuns,
  settleFinishedPumps,
} from '#/tick/reconcile.js';
import { deliverReplies } from '#/tick/steering.js';
import { beginTick, endTick, requestTick } from '#/tick/tick-requests.js';
import { moveTicket } from '#/tick/ticket-moves.js';
import { triageInbox } from '#/tick/triage.js';
import { checkInvariants } from '#/tick/violations.js';
import type { EngineCtx, EngineState } from '#/types/engine-state.types.js';
import type { Engine, EngineDeps, TickReport } from '#/types/engine.types.js';

function emptyReport(nowIso: string, firstTick: boolean): TickReport {
  return {
    at: nowIso,
    firstTick,
    crashed: [],
    settled: [],
    triaged: [],
    dispatched: [],
    steered: [],
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
  const ctx: EngineCtx = {
    deps,
    state,
    report: emptyReport(iso(now), state.firstTick),
    now,
    nowIso: iso(now),
  };

  beginTick(state);
  if (state.firstTick) {
    await phase(ctx, 'restart reconcile', crashForeignRuns);
    state.firstTick = false;
  }

  await phase(ctx, 'settle runs', settleFinishedPumps);
  await phase(ctx, 'stall scan', cancelStalled);
  await phase(ctx, 'expire interactions', expireInteractions);
  await phase(ctx, 'deliver replies', deliverReplies);
  await phase(ctx, 'triage', triageInbox);
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
    holds: new Map(),
    baseShas: new Map(),
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
        await deps.driver.cancel(pump.handle).catch((e: unknown) => {
          deps.log?.('error', `cancel of ${pump.runId} failed`, { error: String(e) });
        });
      }

      if (moved.ticket.worktree) {
        await deps.worktrees.remove(moved.ticket.worktree).catch((e: unknown) => {
          deps.log?.('warn', `could not remove worktree of ${ticketId}`, {
            error: String(e),
          });
        });
      }

      requestTick(deps, state);

      return true;
    },
    liveRunIds: () => [...state.pumps.keys()],
  };

  return engine;
}
