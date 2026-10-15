/**
 * Small UI shapes shared by the work screens (Inbox, Runs).
 *
 * Why: the toast is raised by a screen and rendered by a shared component; one shape keeps
 *   what a toast may carry (a message, a tone, an optional undo) in one place.
 *
 * Exports: ToastState, RunTone, RunFilterKey, CacheSnapshot.
 * Depends on: nothing. Types only.
 */

export interface ToastState {
  readonly tone: 'info' | 'error';
  readonly message: string;
  /** Present when the action can be reversed; the toast then shows an Undo button. */
  readonly undo?: () => void;
}

/** How a run's status is toned: working, parked (waiting on quota), good, bad or neutral. */
export type RunTone = 'working' | 'parked' | 'good' | 'bad' | 'neutral';

/** The groups of runs the Runs screen can filter to. */
export type RunFilterKey = 'all' | 'active' | 'done' | 'problems';

/** What the query cache held before an optimistic change, so a refusal can restore it exactly. */
export type CacheSnapshot = readonly (readonly [readonly unknown[], unknown])[];
