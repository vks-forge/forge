/**
 * The facts the sign-off reads from a ticket's stage rows.
 *
 * Why: whether the Director may sign, and what the owner reads on the sign-off card, depend on how
 *   the checks of this round really ended. Naming the facts keeps the reader of the rows and the
 *   decision that uses them apart.
 *
 * Exports: SignOffFacts.
 * Depends on: @forge/core (Severity). Types only.
 */

import type { Severity } from '@forge/core';

export interface SignOffFacts {
  /** Every gate, review and script of the round passed outright (not skipped, not errored). */
  readonly checksPassed: boolean;
  /** How many of those checks there are. */
  readonly passed: number;
  /** The Director check passed without an override and with every criterion confirmed; false when it is missing or skipped. */
  readonly checkPassed: boolean;
  /** Owner overrides on rows that stand. */
  readonly overrides: number;
  /** Findings reported by the standing checks, by severity. */
  readonly counts: Record<Severity, number>;
}
