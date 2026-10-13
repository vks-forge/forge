/**
 * ReportStore port — where gate reports are kept.
 *
 * Why: a gate's verdict is a short status, but the reviewer who sees a red gate needs the
 *   full report (which claim was unsupported, which check failed and why). The engine
 *   saves each report through this port and stores only the returned reference on the
 *   `gate_results` row, so the database stays small and the same row works whether the
 *   reports live on disk next to the run, in memory for tests, or somewhere else later.
 *
 * Exports: ReportStore.
 * Depends on: none. Types only.
 */

/** Saves gate report text for a run and hands back an opaque reference to it. */
export interface ReportStore {
  /** Stores `text` as report `name` of run `runId`; returns the reference kept in `gate_results.report_ref`. */
  put(runId: string, name: string, text: string): Promise<string>;
}
