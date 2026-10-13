/**
 * G1 report renderer.
 *
 * Why: the verdict's report is what the Worker reads on rework and what the Ticket screen
 *   shows a human. One section per check, in a fixed order, with the status first, keeps
 *   it scannable: a reader finds the failing check and its quoted evidence without
 *   parsing JSON.
 *
 * Exports: renderReport().
 * Depends on: types/check.types. No IO.
 */

import type { GateStatus } from '@forge/core';
import type { CheckOutcome } from '#/types/check.types.js';

/** Markdown report: a heading with the overall status, then one section per check. */
export function renderReport(
  status: GateStatus,
  outcomes: readonly CheckOutcome[],
  at: Date,
): string {
  const parts = [`# G1 report: ${status}`, `Generated ${at.toISOString()}.`];
  for (const o of outcomes) {
    parts.push(`## ${o.name}: ${o.status}`, o.details);
  }

  return `${parts.join('\n\n')}\n`;
}
