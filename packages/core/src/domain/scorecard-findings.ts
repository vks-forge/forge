/**
 * Scorecard findings — what became of the findings a check raised.
 *
 * Why: a reviewer that raises many findings is only useful if they are right. The owner's mark ("Real" or
 *   "False alarm") is the only direct judgement, so it beats everything. Without a mark the engine derives
 *   what it honestly can: a finding is `acted_on` when its cycle ended in a rework and the same stage passed
 *   in a later cycle, `overruled` when the owner merged the held work anyway, and `unjudged` otherwise. A
 *   link to a later bug waits for issue sync. Each finding lands in exactly one bucket, so the buckets add
 *   up to the findings raised.
 *
 * Exports: tallyFindings().
 * Depends on: schemas/pipeline, schemas/scorecard, schemas/stage-run. No IO.
 */

import type { Severity } from '#/schemas/pipeline.js';
import type { FindingMark, ScorecardRow } from '#/schemas/scorecard.js';
import type { StageRun } from '#/schemas/stage-run.js';

const SEVERITIES: readonly Severity[] = ['critical', 'high', 'medium', 'low'];

/**
 * The tally of every finding in `rows` (the check rows to count). `all` is every stage row of the same
 * tickets, so a later cycle that passed can be found; `marks` are the owner's verdicts.
 */
export function tallyFindings(
  rows: readonly StageRun[],
  all: readonly StageRun[],
  marks: readonly FindingMark[],
): NonNullable<ScorecardRow['findings']> {
  const marked = new Map(
    marks.map((m) => [`${m.stage_run_id}:${m.finding_index}`, m.verdict]),
  );

  const tally: NonNullable<ScorecardRow['findings']> = {
    by_severity: Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<
      Severity,
      number
    >,
    real: 0,
    false_alarm: 0,
    acted_on: 0,
    overruled: 0,
    unjudged: 0,
  };

  for (const row of rows) {
    const findings = row.outcome.review?.findings ?? [];
    const passedLater = all.some(
      (r) =>
        r.ticket_id === row.ticket_id &&
        r.stage_id === row.stage_id &&
        r.member_id === row.member_id &&
        r.cycle > row.cycle &&
        r.status === 'passed',
    );

    findings.forEach((f, index) => {
      tally.by_severity[f.severity] += 1;
      const mark = marked.get(`${row.id}:${index}`);
      if (mark === 'real') {
        tally.real += 1;
      } else if (mark === 'false_alarm') {
        tally.false_alarm += 1;
      } else if (row.outcome.override !== undefined) {
        tally.overruled += 1;
      } else if (row.status === 'failed' && passedLater) {
        tally.acted_on += 1;
      } else {
        tally.unjudged += 1;
      }
    });
  }

  return tally;
}
