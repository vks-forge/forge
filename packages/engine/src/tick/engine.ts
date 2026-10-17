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
 *
 *   The escalation phases run between expiring questions and the planning sweep: the Director's
 *   first look at every new wait, then the automatic resume of fixed setups; at the first tick
 *   the backfill gives tickets parked before escalations existed one to act on.
 */

import { familyOf } from '#/domain/results.js';
import { iso } from '#/shared/time.js';
import { emitTrace } from '#/shared/trace.js';
import { runCardChats } from '#/tick/card-chat.js';
import { cardDirectorStatus, postCardMessage } from '#/tick/card-chat-post.js';
import { closeCardWork, sweepClosedCards } from '#/tick/card-close.js';
import { createCard, setCardRelations } from '#/tick/card-create.js';
import { dispatchReady } from '#/tick/dispatch.js';
import { backfillEscalations } from '#/tick/escalation-backfill.js';
import { actOnEscalation, actOnTicket } from '#/tick/escalation-act.js';
import { sweepEscalations } from '#/tick/escalation-director.js';
import { explainWait } from '#/tick/explain.js';
import { answerInteraction, expireInteractions } from '#/tick/interactions.js';
import { ingest } from '#/tick/intake.js';
import { interruptRun } from '#/tick/interrupt.js';
import {
  requestPlanChanges,
  retryPlanningStep,
  startPlanning,
} from '#/tick/plan-actions.js';
import { editPlanTickets } from '#/tick/plan-edit.js';
import { cardPlan, cardPlans } from '#/tick/plan-reads.js';
import { approvePlan } from '#/tick/plan-to-tickets.js';
import { reviewOf } from '#/tick/review-facts.js';
import { runAsExpress } from '#/tick/run-as-express.js';
import { answerGrill, grillShortcut } from '#/tick/planning-owner.js';
import { sweepPlanning } from '#/tick/planning-sweep.js';
import { cancelStalled, settleFinishedPumps } from '#/tick/reconcile.js';
import { reconcileRestart, resumeInterrupted } from '#/tick/restart.js';
import { steerRun } from '#/tick/steer-run.js';
import { deliverReplies } from '#/tick/steering.js';
import { beginTick, endTick, requestTick } from '#/tick/tick-requests.js';
import { resumeFixedSetups } from '#/tick/setup-recheck.js';
import { cancelTicketsTx, stopCancelled } from '#/tick/ticket-cancel.js';
import { loadTickConfig } from '#/tick/tick-config.js';
import { emptyReport } from '#/tick/tick-report.js';
import { triageInbox } from '#/tick/triage.js';
import { verifyReady } from '#/tick/verify.js';
import { checkInvariants } from '#/tick/violations.js';
import type { EngineCtx, EngineState } from '#/types/engine-state.types.js';
import type { Engine, EngineDeps, TickReport } from '#/types/engine.types.js';
import type { TickConfig } from '#/types/tick.types.js';

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
    emitTrace(ctx.deps, {
      level: 'error',
      kind: 'error',
      actor: 'engine',
      message: `${where} failed: ${message}`,
      data: {
        where,
        family: familyOf(e),
        error: message,
        ...(e instanceof Error && e.stack ? { stack: e.stack } : {}),
      },
    });
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
  // Work of a closed card is cancelled before anything can raise a wait for it or run it.
  await phase(ctx, 'closed cards', async (c) => void (await sweepClosedCards(c)));
  if (state.firstTick) {
    await phase(ctx, 'restart reconcile', reconcileRestart);
    // Tickets parked before escalations existed get one to act on, once, at start.
    await phase(
      ctx,
      'escalation backfill',
      async (c) => void (await backfillEscalations(c)),
    );

    state.firstTick = false;
  }

  await phase(ctx, 'resume interrupted runs', resumeInterrupted);

  await phase(ctx, 'settle runs', settleFinishedPumps);
  await phase(ctx, 'stall scan', cancelStalled);
  await phase(ctx, 'expire interactions', expireInteractions);
  await phase(ctx, 'deliver replies', deliverReplies);
  await phase(ctx, 'escalations first look', sweepEscalations);
  await phase(ctx, 'setup recheck', async (c) => void (await resumeFixedSetups(c)));
  await phase(ctx, 'planning sweep', sweepPlanning);
  await phase(ctx, 'card chat', runCardChats);
  await phase(ctx, 'triage', triageInbox);
  await phase(ctx, 'verify', verifyReady);
  // A park that verify just made gets its first look in the same tick, so a Director retry can dispatch now.
  await phase(ctx, 'escalations after verify', sweepEscalations);
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
    chat: { pending: new Set(), busy: new Set(), errors: new Map() },
    escalating: new Set(),
    settleFailures: new Map(),
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
    createCard: (input) => createCard(deps, state, input),
    setCardRelations: (cardId, input) => setCardRelations(deps, cardId, input),
    answerGrill: (cardId, input, author) =>
      answerGrill(deps, state, cardId, input, author),
    grillShortcut: (cardId, kind, author) =>
      grillShortcut(deps, state, cardId, kind, author),
    approvePlan: (cardId, version, author) =>
      approvePlan(deps, state, cardId, version, author),
    requestPlanChanges: (cardId, version, comment, author) =>
      requestPlanChanges(deps, state, cardId, version, comment, author),
    editPlanTickets: (cardId, version, input, author) =>
      editPlanTickets(deps, state, cardId, version, input, author),
    startPlanning: (cardId, author) => startPlanning(deps, state, cardId, author),
    retryPlanningStep: (cardId, author) => retryPlanningStep(deps, state, cardId, author),
    runAsExpress: (ticketId, author) => runAsExpress(deps, state, ticketId, author),
    cardPlans: (cardId) => cardPlans(deps, cardId),
    cardPlan: (cardId, version) => cardPlan(deps, cardId, version),
    answerInteraction: (id, answer) => answerInteraction(deps, state, id, answer),
    steerRun: (runId, message, author) => steerRun(deps, state, runId, message, author),
    postCardMessage: (cardId, text, author) =>
      postCardMessage(deps, state, cardId, text, author),
    cardDirector: (cardId) => cardDirectorStatus(state, cardId),
    closeCardWork: (cardId) => closeCardWork(deps, state, cardId),
    reviewOf: (ticketId) => reviewOf(deps, state, ticketId),
    async cancelTicket(ticketId) {
      const nowIso = iso(deps.clock.now());
      const [cancelled] = await deps.storage.transaction((tx) =>
        cancelTicketsTx(tx, [ticketId], nowIso),
      );

      if (!cancelled) {
        return false;
      }

      await stopCancelled(deps, state, cancelled);
      requestTick(deps, state);

      return true;
    },
    actOnEscalation: (id, body, author) => actOnEscalation(deps, state, id, body, author),
    actOnTicket: (ticketId, body, author) =>
      actOnTicket(deps, state, ticketId, body, author),
    explainWait: (ticketId) => explainWait(deps, state, ticketId),
    interruptRun: (runId) => interruptRun(deps, state, runId),
    liveRunIds: () => [...state.pumps.keys()],
    unservableProjects: () => new Map(state.unservable),
    gateJobsInFlight: () =>
      [...state.gateJobs.values()].filter((j) => j.outcome === undefined).length,
  };

  return engine;
}
