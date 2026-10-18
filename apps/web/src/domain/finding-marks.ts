/**
 * Finding marks: reading and changing the owner's verdicts on a ticket strip.
 *
 * Why: a stage view carries `marks` (`index`, `verdict`) by position in its `findings`, and the
 *   toggle on a finding must show the new verdict before the server answers. Applying a mark to
 *   the view the cache holds, in one place, keeps the optimistic update and the rollback honest:
 *   the view is copied, never edited, and a stage that is not the marked row is left as it was.
 *   Pure.
 *
 * Exports: verdictAt(), withMark(), VERDICT_LABEL.
 * Depends on: @forge/core (types). No IO.
 */

import type { FindingVerdict, StageView, TicketPipelineView } from '@forge/core';

export const VERDICT_LABEL: Readonly<Record<FindingVerdict, string>> = {
  real: 'Real',
  false_alarm: 'False alarm',
};

/** The owner's verdict on the finding at `index` of a stage view, or `undefined` when unmarked. */
export function verdictAt(
  marks: StageView['marks'],
  index: number,
): FindingVerdict | undefined {
  return marks?.find((mark) => mark.index === index)?.verdict;
}

function markStage(
  stage: StageView,
  rowId: number,
  index: number,
  verdict: FindingVerdict | null,
): StageView {
  const members = stage.members?.map((member) =>
    markStage(member, rowId, index, verdict),
  );

  if (stage.row_id !== rowId) {
    return members === undefined ? stage : { ...stage, members };
  }

  const kept = (stage.marks ?? []).filter((mark) => mark.index !== index);
  const marks =
    verdict === null
      ? kept
      : [...kept, { index, verdict }].sort((a, b) => a.index - b.index);

  return {
    ...stage,
    ...(members === undefined ? {} : { members }),
    marks,
  };
}

/** The view with one finding's mark set, or cleared when `verdict` is `null`. */
export function withMark(
  view: TicketPipelineView,
  rowId: number,
  index: number,
  verdict: FindingVerdict | null,
): TicketPipelineView {
  return {
    ...view,
    stages: view.stages.map((stage) => markStage(stage, rowId, index, verdict)),
  };
}
