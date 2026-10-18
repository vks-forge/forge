/**
 * Sign-off facts — what the stage rows say about the checks before a sign-off.
 *
 * Why: whether the Director may sign (and what the owner reads on the sign-off card) depends on
 *   how the checks of this round really ended, which the stage rows record: did every gate, review
 *   and script pass outright, how many findings of each severity were reported, did the owner
 *   overrule anything, did the Director's check against the plan pass. This reads those facts from
 *   the rows alone, for the checks that stand in the current cycle (earlier passes still count
 *   after a rework that did not restart them), so the same rows always give the same answer and a
 *   restart cannot change it. A check with no row, or one that was skipped, never counts as passed.
 *
 * Exports: signOffFacts().
 * Depends on: @forge/core (classifyStage, stage types, isDone), types/sign-off-facts. No IO.
 */

import { classifyStage, isDone } from '@forge/core';
import type {
  Severity,
  Stage,
  StageRun,
  StageRunStatus,
  TicketPipeline,
} from '@forge/core';
import type { SignOffFacts } from '#/types/sign-off-facts.types.js';

/** The row that satisfies a stage member at `cycle`: the newest finished one at or before it. */
function standing(
  records: readonly StageRun[],
  stageId: string,
  member: string,
  cycle: number,
): StageRun | undefined {
  return records
    .filter(
      (r) =>
        r.stage_id === stageId && r.member_id === member && r.cycle <= cycle && isDone(r),
    )
    .sort((a, b) => b.cycle - a.cycle || b.id - a.id)[0];
}

const CLEAN: readonly StageRunStatus[] = ['passed'];

/** The facts for the checks that stand before the sign-off at `cycle`. */
export function signOffFacts(
  snapshot: Pick<TicketPipeline, 'definition' | 'roles'>,
  records: readonly StageRun[],
  cycle: number,
): SignOffFacts {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  let passed = 0;
  let clean = true;
  let overrides = 0;
  let checkPassed = false;

  const count = (row: StageRun | undefined): void => {
    for (const f of row?.outcome.review?.findings ?? []) {
      counts[f.severity] += 1;
    }

    if (row?.outcome.override) {
      overrides += 1;
    }
  };

  const member = (stage: Stage, id: string, parent = ''): void => {
    const row = standing(records, parent === '' ? stage.id : parent, id, cycle);
    if (row && CLEAN.includes(row.status)) {
      passed += 1;
    } else {
      clean = false;
    }

    count(row);
  };

  for (const stage of snapshot.definition.stages) {
    const klass = classifyStage(stage, snapshot.roles);
    if (klass === 'g1' || klass === 'script' || klass === 'check_agent') {
      member(stage, '');
    } else if (klass === 'group' && stage.kind === 'group') {
      for (const m of stage.members) {
        member(m, m.id, stage.id);
      }
    } else if (klass === 'director_check') {
      const row = standing(records, stage.id, '', cycle);
      // A criterion the check could not confirm is doubt: the Director does not sign over it.
      const unclear =
        row?.outcome.check?.acceptance.some((a) => a.met !== 'yes') ?? false;

      checkPassed =
        row?.status === 'passed' && row.outcome.override === undefined && !unclear;

      count(row);
    }
  }

  return { checksPassed: clean, passed, checkPassed, overrides, counts };
}
