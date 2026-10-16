/**
 * Small UI shapes shared by the work screens (Inbox, Runs).
 *
 * Why: the Runs screen and its optimistic updates share a few small shapes (how a run is
 *   toned, which filter groups exist, what a cache looked like before a change); one file
 *   keeps them in one place.
 *
 * Exports: RunTone, RunFilterKey, CacheSnapshot.
 * Depends on: nothing. Types only.
 */

/** How a run's status is toned: working, parked (waiting on quota), good, bad or neutral. */
export type RunTone = 'working' | 'parked' | 'good' | 'bad' | 'neutral';

/** The groups of runs the Runs screen can filter to. */
export type RunFilterKey = 'all' | 'active' | 'done' | 'problems';

/** What the query cache held before an optimistic change, so a refusal can restore it exactly. */
export type CacheSnapshot = readonly (readonly [readonly unknown[], unknown])[];
