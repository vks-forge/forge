/**
 * The row shape of a lane diff.
 *
 * Why: a pipeline proposal shows the lane as it would be after the change, one row per stage with
 *   what happened to it. Naming the row once keeps the pure comparison (domain/lane-diff) apart from
 *   the list that draws it. Types only.
 *
 * Exports: LaneDiffRow.
 * Depends on: nothing. Types only.
 */

export interface LaneDiffRow {
  readonly id: string;
  readonly label: string;
  readonly change: 'same' | 'added' | 'removed' | 'moved' | 'swapped';
  /** The agent a changed stage runs, when it has one. */
  readonly agent?: string | undefined;
}
