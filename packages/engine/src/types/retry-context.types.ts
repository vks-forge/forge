/**
 * What a retried Worker is told about why its ticket stopped.
 *
 * Why: a retry wake only carries the owner's note. Without the escalation it answers, the last
 *   review findings and gate failures and a short account of the last run, the Worker starts blind,
 *   changes nothing and the same finding comes back. These are the stored facts, gathered in the
 *   dispatch path and handed to the pure wake delta.
 *
 * Exports: RetryFacts, RetryContext.
 * Depends on: @forge/core (Interaction, StageRun). Types only.
 */

import type { Interaction, StageRun } from '@forge/core';

/** Raw stored facts about a ticket's history, read inside one transaction. */
export interface RetryFacts {
  /** The escalation the retry answered, when the wake names one. */
  readonly escalation: Interaction | null;
  /** Every stage attempt of the ticket, oldest first. */
  readonly stageRuns: readonly StageRun[];
  /** The ticket's last run, with its closing text (finish summary, last text or error message). */
  readonly lastRun: {
    readonly id: string;
    readonly agent?: string;
    readonly status: string;
    readonly error_family?: string;
    readonly text: string;
  } | null;
}

/** The retry brief section, as the prompt step receives it; every key is optional and set only when known. */
export interface RetryContext {
  escalation?: Record<string, unknown>;
  findings?: string;
  gate_failures?: string;
  last_run?: Record<string, unknown>;
}
