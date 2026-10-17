/**
 * In-process engine state: live run pumps, step holds, queued replies, intake hints.
 *
 * Why: the database holds every fact the scheduler decides on, but a few things are
 *   deliberately process-local. A live run's pump (the loop draining the driver's event
 *   stream) cannot outlive the process: on shutdown its run is marked interrupted and the next start
 *   resumes it from the harness session with a new pump (d-0092). A
 *   "hold" stops a failing Director step or worktree from being re-spent on every 10 s
 *   tick. A queued steering reply waits for the next tick because the LLM call must not
 *   happen on the intake request path. Naming the shapes keeps the phases that share them
 *   honest. A gate job is the same kind of fact: the gates run for minutes, so they run beside
 *   the tick instead of inside it, and the job map is what the next tick finds their result in. The requester's hint, type and title are not here: they are read back from the
 *   stored intake event, so a restart cannot lose them.
 *
 * Exports: Pump, Hold, QueuedReply, CardChatState, EngineState, EngineCtx.
 * Depends on: @forge/core (RunHandle, RunResult), types/engine. Types only.
 */

import type { RunHandle, RunResult, WorkerDriver } from '@forge/core';
import type { EngineDeps, TickReport } from '#/types/engine.types.js';
import type { TickConfig } from '#/types/tick.types.js';
import type { StageJob } from '#/types/stage-runner.types.js';
import type { GateJob } from '#/types/verify.types.js';

/** One live run: its handle and, once the stream and result are in, the outcome. */
export interface Pump {
  readonly runId: string;
  readonly handle: RunHandle;
  /** The driver that started the run; steering, cancelling and results go back to it. */
  readonly driver: WorkerDriver;
  done: boolean;
  result?: RunResult;
  error?: unknown;
  /** Set when the engine itself cancelled the run for a stall. */
  stalled?: boolean;
  /** Set when a human cancelled the ticket; the settle must not retry. */
  cancelled?: boolean;
  /** True for a run restarted from its harness session after a restart (d-0092). */
  readonly resumed: boolean;
  /** Events the stream has produced; a resumed run that ends with none never got its session back. */
  events: number;
  /** Set when the server is shutting down: the run is `interrupted` for a resume, never settled by this process. */
  interrupted?: boolean;
  /** `ask` events seen on the stream, to rebuild an interaction the Worker side did not write. */
  readonly asks: Map<string, { kind: string; prompt: string }>;
  /** Resolves once the stream is drained and the result (or error) is in. */
  finished: Promise<void>;
}

/** Do not retry a failing step or dispatch before `until` (epoch ms). */
export interface Hold {
  until: number;
}

/** A user reply waiting for the next tick's `steer_reply` step. */
export interface QueuedReply {
  readonly ticketId: string;
  readonly text: string;
  readonly author: string;
}

/**
 * Card chat bookkeeping, process-local: a view of work in flight for the Card page. The owed
 * replies themselves are stored (`card_reply_queue`), so a restart loses only error flags.
 */
export interface CardChatState {
  /** Cards whose reply is queued and not yet claimed; a mirror of the queue for `cardDirector()`. */
  readonly pending: Set<string>;
  /** Cards whose chat step is running now. */
  readonly busy: Set<string>;
  /** The last failed reply per card, cleared by the next message or a successful reply. */
  readonly errors: Map<string, string>;
}

export interface EngineState {
  firstTick: boolean;
  running: Promise<TickReport> | null;
  /** A tick was requested while one was running. */
  requested: boolean;
  /** `onTickRequested` was called and no tick has started since. */
  notified: boolean;
  readonly pumps: Map<string, Pump>;
  /** The project that got the last Worker slot; the next dispatch rotates to the project after it (d-0097). */
  schedulerCursor: string | undefined;
  /** Projects whose settings failed to validate in the last tick, slug to reason (for GET /projects). */
  unservable: ReadonlyMap<string, string>;
  readonly holds: Map<string, Hold>;
  readonly baseShas: Map<string, string>;
  /** Gate runs in flight or finished-but-unapplied, by `ticket:run`; lost on restart, so the gates simply run again. */
  readonly gateJobs: Map<string, GateJob>;
  /** Script gates and red proofs in flight or finished-but-unapplied, by `ticket:run:stage:member`; lost on restart, so the command simply runs again. */
  readonly stageJobs: Map<string, StageJob>;
  /** Tickets (`ticket:run`) whose routing rules were already evaluated on the real diff this process; the evaluation is idempotent, this only saves the git call. */
  readonly diffRouted: Set<string>;
  /** Re-gates after the PR head moved, per `ticket:run`, to stop a branch that never settles. */
  readonly regates: Map<string, number>;
  replies: QueuedReply[];
  readonly chat: CardChatState;
  /** Interactions the Director's first look is working on now; keeps one tick from looking twice at the same row. */
  readonly escalating: Set<string>;
  /** Consecutive failed settles per run id; a run that keeps failing is parked, not retried for ever. */
  readonly settleFailures: Map<string, number>;
}

/** What every phase receives. */
export interface EngineCtx {
  readonly deps: EngineDeps;
  readonly state: EngineState;
  readonly report: TickReport;
  /** Settings snapshot taken when this tick began. */
  readonly config: TickConfig;
  /** Epoch ms for this tick. */
  readonly now: number;
  readonly nowIso: string;
}
