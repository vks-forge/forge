/**
 * Shapes shared by the tick phases: ticket plans, wake requests, dispatch candidates.
 *
 * Why: the phases (intake, triage, settle, dispatch) all change tickets and wakes the same
 *   way, through one plan-and-apply door, and hand each other small records (which ticket
 *   to start and why). Naming those records here keeps each phase file about its own rule
 *   and keeps hand-written types in one place.
 *
 * Exports: EventSpec, TicketFields, TicketPlan, MoveResult, WakeInput, WakeOutcome,
 *   DispatchKind, Candidate, DispatchPlan, WakeView, ScheduleView, StepReject, TickConfig, RewakeCap,
 *   SettleOptions, RunRequestInput.
 * Depends on: @forge/core (TicketEvent, Ticket, WakeKind, WakeRequest, StepError),
 *   types/pick-next, types/run-agent. Types only.
 */

import type {
  ForgeConfig,
  ProjectConfigView,
  RunStatus,
  StepError,
  Ticket,
  TicketEvent,
  WakeKind,
  WakeRequest,
} from '@forge/core';
import type { Receipt } from '@forge/tools';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { PickCandidate, PickCaps, PickRunning } from '#/types/pick-next.types.js';
import type { ResolvedAgent } from '#/types/run-agent.types.js';

type WithoutAt<E> = E extends TicketEvent ? Omit<E, 'at' | 'expected_version'> : never;

/** A ticket event as the engine states it; `at` is stamped by the move. */
export type EventSpec = WithoutAt<TicketEvent>;

/** The non-status ticket columns a move may set after its events (status only moves via events). */
export interface TicketFields {
  title?: string;
  type?: Ticket['type'];
  /** Only a person's "run as Express" lowers a lane; the Director's own moves raise it (d-0141 item 9). */
  lane?: Ticket['lane'];
  branch?: string | undefined;
  worktree?: string | undefined;
  assignee_run_id?: string | undefined;
  blocked_reason?: string | undefined;
  pr_number?: number | undefined;
  pr_url?: string | undefined;
}

/** What to do to one ticket: events through `transition()` in order, then plain fields. */
export interface TicketPlan {
  readonly events: readonly EventSpec[];
  readonly fields?: TicketFields;
}

export type MoveResult =
  | { readonly ok: true; readonly ticket: Ticket }
  | { readonly ok: false; readonly reason: string };

export interface WakeInput {
  /** A retry wake that is not an automated recovery attempt (a quota wait), so the hourly re-wake cap does not count it. */
  readonly uncapped?: boolean;
  readonly ticketId: string;
  readonly kind: WakeKind;
  readonly reason: string;
  /** With `ticketId` and `reason`, makes the wake idempotent. */
  readonly key: string;
  /** Epoch ms; absent means due now. */
  readonly notBefore?: number;
}

export interface WakeOutcome {
  /** False when the wake coalesced into an existing one or was refused by the cap. */
  readonly created: boolean;
  /** True when the re-wake cap refused it: the caller parks the ticket. */
  readonly capped: boolean;
  readonly wake?: WakeRequest;
}

export type DispatchKind = 'new' | 'retry' | 'resume';

/** A ticket the dispatch phase will try to start, and the wake behind it if any. */
export interface Candidate {
  readonly ticket: Ticket;
  readonly kind: DispatchKind;
  readonly wake?: WakeRequest;
}

/** What a wake check needs from the tick; a read-only caller builds one without a report. */
export type WakeView = Pick<EngineCtx, 'deps' | 'state' | 'nowIso'>;

/** What planning needs from the tick: the ports, process state, settings snapshot and clock. */
export type ScheduleView = WakeView & Pick<EngineCtx, 'config' | 'now'>;

/** What one dispatch decision is made from: the tickets that could start and the limits they meet. */
export interface DispatchPlan {
  /** The full candidate (ticket, kind, wake) behind each pickable id. */
  readonly candidates: ReadonlyMap<string, Candidate>;
  readonly pickable: readonly PickCandidate[];
  readonly running: readonly PickRunning[];
  readonly caps: PickCaps;
}

/** Why a Director step produced nothing; the engine logs it and holds the step off. */
export interface StepReject {
  readonly error: StepError;
}

/**
 * The settings one tick runs on, read once at its start: the company-wide dials and, per
 * project, the project's own settings with the versions both came from. Phases read this,
 * never the source, so a settings edit lands between ticks and never inside one.
 */
export interface TickConfig {
  readonly forge: ForgeConfig;
  readonly companyVersion: number;
  readonly projects: ReadonlyMap<string, ProjectConfigView>;
  /** Slug to reason for each live project whose stored settings did not validate; it is skipped this tick. */
  readonly unservable: ReadonlyMap<string, string>;
}

/** The hourly re-wake cap of the engine settings. */
export type RewakeCap = ForgeConfig['engine']['rewake_cap'];

/** Overrides for runs that end by the Director's own decision rather than a driver result. */
export interface SettleOptions {
  /** The stored status instead of the one the result implies (a given-up resume is `settled`). */
  readonly status?: RunStatus;
  /** The retry wake's reason instead of the error family. */
  readonly retryReason?: string;
  /** The reason the ticket parks with, when the failure parks it, instead of the family's generic one. */
  readonly parkReason?: string;
  /** The harness build that changed under the approvals: the park is a setup for the owner (review the build), not a failure. */
  readonly parkBuild?: { readonly installed: string | null };
  /** The run's receipts, read before the settle transaction: the receipt log shares the writer lock, so it cannot be read inside it. */
  readonly receipts?: readonly Receipt[] | undefined;
}

/** What differs between one run's start request and another's; the rest comes from the settings. */
export interface RunRequestInput {
  readonly runId: string;
  readonly ticket: Ticket;
  /** The agent the run is for: its model, budget and harness-specific model apply. */
  readonly agent: ResolvedAgent;
  /** The harness the run starts on when a fallback harness took it; absent means the agent's own. */
  readonly harnessId?: string;
  readonly cwd: string;
  readonly prompt: string;
  readonly promptHash: string;
  /** The run's bearer token; the app registers it with a new secret before the harness starts. */
  readonly token: string;
  /** The harness session to continue (a resume after an answer or a restart). */
  readonly resume?: string;
  /** Secret generation: absent for a first start, the run's new generation on a restart resume. */
  readonly generation?: number;
}
