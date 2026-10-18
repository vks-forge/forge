/**
 * What the ticket's strip says beyond the stage rows: the Director's changes, the run that really ran, the owner's marks.
 *
 * Why: the owner approved a plan that said "add a security reviewer, drop the second reviewer", and a stage may later
 *   have run on a fallback model or a substitute agent. If the strip hid any of that the owner could not tell their own
 *   pipeline from the Director's, nor which model wrote the code. These helpers read the adjustment log, the run rows and
 *   the owner's marks and say it: an added, swapped or moved stage carries the change and its reason, a removed stage
 *   is listed as a ghost, a stage says which harness, model and fallback slot its latest run used, and its findings carry
 *   the owner's "Real" or "False alarm".
 *
 * Exports: ranOn(), markedFindings(), changesById(), removedStages(), markChanged().
 * Depends on: schemas/pipeline, schemas/pipeline-adjust, schemas/stage-run, types/stage-view. No IO.
 */

import type { PipelineAdjustment } from '#/schemas/pipeline-adjust.js';
import type { Stage } from '#/schemas/pipeline.js';
import type { StageRun, TicketPipelineView } from '#/schemas/stage-run.js';
import type { StageView, ViewContext } from '#/types/stage-view.types.js';

/** What a stage's latest run used, read from its run row; slot 0 when the run predates fallback slots. */
export function ranOn(
  row: StageRun | undefined,
  ctx: ViewContext,
): Pick<StageView, 'ran_on'> {
  const run = row?.run_id === undefined ? undefined : ctx.runs?.get(row.run_id);

  return run
    ? {
        ran_on: {
          harness: run.harness,
          ...(run.model === undefined ? {} : { model: run.model }),
          slot: run.fallback_slot ?? 0,
        },
      }
    : {};
}

/** The owner's marks on the findings of the row a stage view shows, by position in the findings. */
export function markedFindings(
  row: StageRun | undefined,
  ctx: ViewContext,
): Pick<StageView, 'marks'> {
  const marks = (ctx.marks ?? [])
    .filter((m) => m.stage_run_id === row?.id)
    .map((m) => ({ index: m.finding_index, verdict: m.verdict }))
    .sort((a, b) => a.index - b.index);

  return marks.length > 0 ? { marks } : {};
}

/** The latest applied change per stage id (a swap of a group member is keyed by the member's id). */
export function changesById(
  adjustments: readonly PipelineAdjustment[],
): Map<string, StageView['changed']> {
  const out = new Map<string, StageView['changed']>();
  for (const a of adjustments.filter((x) => x.status === 'applied')) {
    const { op } = a;
    if (op.op !== 'remove') {
      const id =
        op.op === 'add'
          ? op.stage.id
          : op.op === 'swap'
            ? (op.member_id ?? op.stage_id)
            : op.stage_id;

      out.set(id, { by: 'director', op: op.op, cause: a.cause, reason: op.reason });
    }
  }

  return out;
}

/** Stages the Director removed that are no longer in the list, with a readable label made from the id. */
export function removedStages(
  adjustments: readonly PipelineAdjustment[],
  stages: readonly Stage[],
): TicketPipelineView['removed'] {
  const present = new Set(
    stages.flatMap((s) =>
      s.kind === 'group' ? [s.id, ...s.members.map((m) => m.id)] : [s.id],
    ),
  );

  return adjustments.flatMap((a) =>
    a.status === 'applied' && a.op.op === 'remove' && !present.has(a.op.stage_id)
      ? [
          {
            id: a.op.stage_id,
            label: a.op.stage_id
              .replace(/[-_]+/g, ' ')
              .replace(/^./, (c) => c.toUpperCase()),
            reason: a.op.reason,
          },
        ]
      : [],
  );
}

/** Puts each change on the stage view (or group member view) it concerns. */
export function markChanged(
  views: StageView[],
  changes: ReadonlyMap<string, StageView['changed']>,
): StageView[] {
  return views.map((v) => {
    const members = v.members ? markChanged(v.members, changes) : undefined;
    const changed = changes.get(v.id);

    return {
      ...v,
      ...(members ? { members } : {}),
      ...(changed ? { changed } : {}),
    };
  });
}
