/**
 * Pipeline inspection: read-only questions about a stage list.
 *
 * Why: the editor must show each problem beside the row it concerns (a member's problem on its
 *   group's row, a list-wide one above the list) and must know whether a draft differs from what
 *   was saved, whatever order the keys came back in. Neither changes the list, so they live apart
 *   from the edit rules.
 *
 * Exports: indexProblems(), sameDefinition().
 * Depends on: @forge/core (types), types/pipeline-ui.types. No IO.
 */

import type { PipelineDefinition, PipelineProblem } from '@forge/core';
import type { ProblemIndex } from '#/types/pipeline-ui.types.js';

/** Problems filed under the row they belong to; a member's problem sits on its group's row. */
export function indexProblems(
  def: PipelineDefinition,
  problems: readonly PipelineProblem[],
): ProblemIndex {
  const rowOf = new Map<string, string>();

  for (const s of def.stages) {
    rowOf.set(s.id, s.id);

    if (s.kind === 'group') {
      s.members.forEach((m) => rowOf.set(m.id, s.id));
    }
  }

  const general: PipelineProblem[] = [];
  const byStage = new Map<string, PipelineProblem[]>();
  const seen = new Set<string>();

  for (const p of problems) {
    const key = `${p.code}|${p.stage_id ?? ''}|${p.message}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    const row = p.stage_id === undefined ? undefined : rowOf.get(p.stage_id);

    if (row === undefined) {
      general.push(p);
    } else {
      byStage.set(row, [...(byStage.get(row) ?? []), p]);
    }
  }

  return { general, byStage };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));

    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }

  return JSON.stringify(value);
}

/** Whether two lists are the same stages in the same order, whatever the key order. */
export function sameDefinition(a: PipelineDefinition, b: PipelineDefinition): boolean {
  return canonical(a) === canonical(b);
}
