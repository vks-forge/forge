/**
 * Shapes of a Director job as the engine tracks it.
 *
 * Why: a Director step is a model call of seconds to minutes. If the tick awaited it, every other
 *   ticket would wait behind it, so steps run as jobs beside the tick (like gate runs) and the
 *   next tick collects them. The tracker needs to know what a job is for (its key, so a card or
 *   ticket never has two at once), when it began, and how it ended, plus the report it filled
 *   in, which outlives the tick that started it and is merged into the next one.
 *
 *   A ticket step must not move ticket state from the job (only the tick does), so its body returns
 *   the write to make as an `apply` the next tick runs once it has checked the ticket still matches.
 *
 * Exports: DirectorJobKey, DirectorJobKind, DirectorJobOutcome, DirectorJob, DirectorJobSpec,
 *   DirectorApply, Briefing.
 * Depends on: types/engine (TickReport), types/engine-state (EngineCtx). Types only.
 */

import type { TickReport } from '#/types/engine.types.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** `card:<cardId>` for a card turn, `ticket:<ticketId>` for a ticket step: at most one job per key. */
export type DirectorJobKey = `card:${string}` | `ticket:${string}`;

/**
 * What the job does: a card turn (chat or planning), a step about one ticket, or the brief of a
 * Worker run (worktree, memory, `dispatch_prompt`). A brief takes no Director slot: the Worker
 * limits already bound it, and counting it would put Workers back behind planning.
 */
export type DirectorJobKind = 'card_turn' | 'ticket_step' | 'brief';

/** The write a ticket step decided on; the tick runs it with its own context after re-checking the ticket. */
export type DirectorApply = (ctx: EngineCtx) => Promise<void>;

/** A Worker slot reserved for a ticket whose brief is being written, counted as running by the scheduler. */
export interface Briefing {
  readonly project: string;
  readonly harness: string;
  /** True when starting the run moves the ticket into In Progress, so the In Progress limit counts it. */
  readonly entering: boolean;
}

/** How a job ended; a throw the body did not handle is `ok: false`. */
export type DirectorJobOutcome =
  { readonly ok: true } | { readonly ok: false; readonly error: unknown };

/** One Director job in flight, or finished and not yet collected by a tick. */
export interface DirectorJob {
  readonly key: DirectorJobKey;
  readonly kind: DirectorJobKind;
  /** The card or ticket id the job works on. */
  readonly subject: string;
  /** Epoch ms the job started. */
  readonly startedAt: number;
  /** What the job's own phases reported; merged into the next tick's report when collected. */
  readonly report: TickReport;
  outcome?: DirectorJobOutcome;
  /** What a ticket step decided to write; run by the tick that collects the job, never by the job. */
  apply?: DirectorApply;
  /** Settles when the job is over and `outcome` is set (tests and shutdown await it). */
  done: Promise<void>;
}

/** What a caller gives `startDirectorJob`: the key, and the body that runs with the job's own context (it may return the write for the tick to apply). */
export interface DirectorJobSpec {
  readonly key: DirectorJobKey;
  readonly kind: DirectorJobKind;
  readonly subject: string;
  readonly run: (jobCtx: EngineCtx) => Promise<void | DirectorApply>;
}
