/**
 * Fails an end-to-end wait the moment a gate fails, with the gate's own findings.
 *
 * Why: a failed G1 sends the ticket to rework and the scripted Worker has nothing scripted for
 *   a second run, so a test that only waits for `done` hangs until its timeout and says nothing
 *   about why. Reading the stored gate report as soon as a result is `failed` turns that hang
 *   into an immediate error that quotes the finding (for G1: which call lacks a receipt).
 *
 * Exports: GateResultView, assertNoFailedGate(), failedGateReport().
 * Depends on: helpers/e2e-rig (type only). IO: reads the report file under the data home.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { E2eRig } from '#tests/helpers/e2e-rig.js';
import { FatalWaitError } from '#tests/helpers/wait-for.js';

export interface GateResultView {
  gate: string;
  status: string;
  report_ref?: string;
}

/** The report text of the first failed gate in `results`, or null when none failed. */
export function failedGateReport(
  rig: E2eRig,
  results: readonly GateResultView[],
): { gate: string; report: string } | null {
  const failed = results.find((g) => g.status === 'failed');
  if (!failed) {
    return null;
  }

  let report = '(no report stored)';
  if (failed.report_ref) {
    try {
      report = readFileSync(
        join(rig.settings.layout.data.home, failed.report_ref),
        'utf8',
      );
    } catch (error) {
      report = `(report unreadable: ${String(error)})`;
    }
  }

  return { gate: failed.gate, report };
}

/** Throws a `FatalWaitError` with the report text of the first failed gate in `results`; does nothing when none failed. */
export function assertNoFailedGate(
  rig: E2eRig,
  results: readonly GateResultView[],
): void {
  const failed = failedGateReport(rig, results);
  if (failed) {
    throw new FatalWaitError(`gate ${failed.gate} failed:\n${failed.report}`);
  }
}
