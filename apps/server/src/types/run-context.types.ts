/**
 * The lookups a run row needs to become a Runs screen row.
 *
 * Why: ticket titles, project slugs and parked harnesses are read once per request and shared
 *   by every run on the page, so a page of runs costs a few reads, not one set per run.
 *
 * Exports: RunContext.
 * Depends on: nothing. Types only.
 */

export interface RunContext {
  readonly nowMs: number;
  /** Ticket id to its title and project slug. */
  readonly tickets: ReadonlyMap<string, { title: string; project?: string }>;
  /** Harness ids parked until a quota reset that has not passed yet. */
  readonly pausedHarnesses: ReadonlySet<string>;
}
