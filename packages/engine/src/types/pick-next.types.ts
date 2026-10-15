/**
 * Shapes of the scheduling decision: what waits to start, what runs, the limits, the answer.
 *
 * Why: choosing which ticket gets the next Worker slot is a pure decision over plain data.
 *   Keeping its inputs and outputs as small records (no ticket rows, no storage) lets one
 *   function serve the dispatch phase, which starts the runs, and the ticket page, which
 *   explains why a ticket is still waiting, and lets property tests generate any mix of
 *   projects, harnesses and limits (d-0097).
 *
 * Exports: PickCandidate, PickRunning, PickCaps, PausedHarness, WaitReason, PickResult.
 * Depends on: none. Types only.
 */

/** A ticket that could start a run now, with the harness it would run on. */
export interface PickCandidate {
  /** Ticket id, e.g. `PAY-12`. */
  readonly id: string;
  readonly project: string;
  /** The harness the run would use, after any quota fallback. */
  readonly harness: string;
  /** Higher starts first within its project. */
  readonly priority: number;
  /** The numeric part of the ticket id; the final tie-break. */
  readonly number: number;
  /** A due wake (retry, resume, rework) is already committed work and goes before new tickets. */
  readonly wake: boolean;
  /** True when starting the run moves the ticket into In Progress (counts against that cap). */
  readonly entering: boolean;
  /** Ids of blockers that are not done; a ticket with any is never picked. */
  readonly blockedBy: readonly string[];
}

/** One live run: which project and harness it occupies. */
export interface PickRunning {
  readonly project: string;
  readonly harness: string;
}

/** A harness parked until `until` (epoch ms). */
export interface PausedHarness {
  readonly until: number;
  readonly reason: string;
}

/** Every limit the scheduler obeys; all counts are of runs live right now. */
export interface PickCaps {
  readonly global: number;
  readonly perProject: {
    readonly default: number;
    readonly byProject: Readonly<Record<string, number>>;
  };
  readonly perHarness: {
    readonly default: number;
    readonly byId: Readonly<Record<string, number>>;
  };
  /** Tickets already In Progress and the most allowed. */
  readonly inProgress: { readonly used: number; readonly limit: number };
  readonly paused: Readonly<Record<string, PausedHarness>>;
}

/** Why a candidate was not picked this tick. */
export type WaitReason =
  | { readonly kind: 'deps'; readonly ids: readonly string[] }
  | {
      readonly kind: 'quota';
      readonly harness: string;
      readonly until: number;
      readonly reason: string;
    }
  | {
      readonly kind: 'cap';
      readonly scope: 'global' | 'project' | 'harness' | 'state';
      /** The project, harness or state the cap belongs to; absent for the global cap. */
      readonly name?: string;
      readonly used: number;
      readonly limit: number;
    };

export interface PickResult {
  /** Tickets to start, in start order. */
  readonly picked: readonly PickCandidate[];
  /** One reason per candidate that was not picked. */
  readonly waits: ReadonlyMap<string, WaitReason>;
  /** The project that got the last slot; pass it back next tick so the rotation continues after it. */
  readonly cursor: string | undefined;
}
