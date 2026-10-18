/**
 * Lane diff: what accepting a pipeline proposal would change in a lane, stage by stage.
 *
 * Why: accepting a proposal rewrites a lane every future ticket of the project runs, and the
 *   owner must see exactly what moves before confirming: which stage appears, which one goes,
 *   which one merely changes place. The two lists are compared by stage id; the result is one
 *   list in the order the lane would have afterwards, with each removed stage shown where it
 *   used to stand, so a removal is never a stage that silently vanishes. A swapped agent is a
 *   change of the stage itself (same id, other agent). Pure.
 *
 * Exports: laneDiff(), laneDiffSummary().
 * Depends on: @forge/core (types), types/lane-diff.types. No IO.
 */

import type { PipelineDefinition } from '@forge/core';
import type { LaneDiffRow } from '#/types/lane-diff.types.js';

const agentOf = (stage: PipelineDefinition['stages'][number]): string | undefined =>
  stage.kind === 'agent' ? stage.agent : undefined;

/** The ids both lists share, in a list's own order. */
function commonOrder(def: PipelineDefinition, other: ReadonlySet<string>): string[] {
  return def.stages.map((s) => s.id).filter((id) => other.has(id));
}

/** The longest run of ids kept in the same relative order; every shared id outside it was moved. */
function keptInOrder(a: readonly string[], b: readonly string[]): ReadonlySet<string> {
  const table = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i]![j] =
        a[i] === b[j]
          ? (table[i + 1]![j + 1] ?? 0) + 1
          : Math.max(table[i + 1]![j] ?? 0, table[i]![j + 1] ?? 0);
    }
  }

  const kept = new Set<string>();
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      kept.add(a[i] as string);
      i += 1;
      j += 1;
    } else if ((table[i + 1]![j] ?? 0) >= (table[i]![j + 1] ?? 0)) {
      i += 1;
    } else {
      j += 1;
    }
  }

  return kept;
}

export function laneDiff(
  current: PipelineDefinition,
  proposed: PipelineDefinition,
): readonly LaneDiffRow[] {
  const was = new Map(current.stages.map((s) => [s.id, s]));
  const now = new Map(proposed.stages.map((s) => [s.id, s]));
  const kept = keptInOrder(
    commonOrder(current, new Set(now.keys())),
    commonOrder(proposed, new Set(was.keys())),
  );

  const rows: LaneDiffRow[] = [];

  const removedAfter = (previousId: string | undefined): void => {
    let anchored = previousId === undefined;

    for (const stage of current.stages) {
      if (!anchored) {
        anchored = stage.id === previousId;
        continue;
      }

      if (now.has(stage.id)) {
        break;
      }

      rows.push({ id: stage.id, label: stage.label, change: 'removed' });
    }
  };

  removedAfter(undefined);

  for (const stage of proposed.stages) {
    const before = was.get(stage.id);
    const agent = agentOf(stage);
    rows.push({
      id: stage.id,
      label: stage.label,
      change:
        before === undefined
          ? 'added'
          : agentOf(before) !== agent
            ? 'swapped'
            : !kept.has(stage.id)
              ? 'moved'
              : 'same',
      ...(agent === undefined ? {} : { agent }),
    });

    removedAfter(stage.id);
  }

  return rows;
}

/** "1 stage added, 1 removed": the diff in one line, or `null` when nothing differs. */
export function laneDiffSummary(rows: readonly LaneDiffRow[]): string | null {
  const count = (change: LaneDiffRow['change']): number =>
    rows.filter((row) => row.change === change).length;

  const parts = (['added', 'removed', 'swapped', 'moved'] as const)
    .map((change) => [change, count(change)] as const)
    .filter(([, n]) => n > 0)
    .map(([change, n]) => `${n} ${change}`);

  return parts.length === 0 ? null : `${parts.join(', ')}`;
}
