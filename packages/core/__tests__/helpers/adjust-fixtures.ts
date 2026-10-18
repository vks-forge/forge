/**
 * Fixtures for the pipeline-adjustment suites: a roster with the shipped agents plus a few extras.
 *
 * Why: the adjust, key, proposal and substitute rules all judge a change against a roster (who is a
 *   writer, what each may write, who is usable). Building the same roster in one place keeps the suites
 *   from drifting apart on what "a narrower writer" or "a second reviewer" means.
 *
 * Exports: roster, ctx, extraAgent, ISO, WHY, meta, add, remove, swap, apply, ids, at.
 * Depends on: src/domain/{builtin-agents,pipeline-adjust}, src/schemas/{agent,pipeline,pipeline-adjust}, src/types/pipeline-rules.types. No IO.
 */

import { BUILTIN_AGENTS } from '#/domain/builtin-agents.js';
import { applyAdjustments } from '#/domain/pipeline-adjust.js';
import type { AgentDefinition, AgentRole } from '#/schemas/agent.js';
import type { PipelineAdjustOp } from '#/schemas/pipeline-adjust.js';
import type { PipelineDefinition, Stage } from '#/schemas/pipeline.js';
import type { RosterEntry } from '#/types/pipeline-rules.types.js';

export const ISO = '2026-10-18T10:00:00.000Z';

/** A custom agent of `role` with the given write scope (reviewers have none). */
export function extraAgent(
  id: string,
  role: AgentRole,
  write_scope: string[] = [],
  tags: RosterEntry['tags'] = [],
): RosterEntry {
  const base =
    BUILTIN_AGENTS[role === 'writer' || role === 'tester' ? 'implementer' : 'reviewer'];

  const definition: AgentDefinition = {
    ...(base as AgentDefinition),
    name: id,
    role,
    write_scope,
    origin: 'custom',
  };

  return { id, tags, definition };
}

const builtin: RosterEntry[] = Object.entries(BUILTIN_AGENTS).map(([id, definition]) => ({
  id,
  tags: [],
  definition,
}));

export const roster: RosterEntry[] = [
  ...builtin,
  extraAgent('security-reviewer', 'reviewer'),
  extraAgent('perf-reviewer', 'reviewer'),
  extraAgent('frontend-writer', 'writer', ['apps/web/**']),
  extraAgent('web-ui-writer', 'writer', ['apps/web/src/ui/**']),
  extraAgent('backend-writer', 'writer', ['packages/**']),
  extraAgent('disabled-reviewer', 'reviewer', [], ['disabled']),
];

export const ctx = (lane: 'express' | 'standard' | 'full' = 'standard') => ({
  roster,
  lane,
  families_available: ['claude'],
  routed: [] as string[],
});

export const WHY = 'The change touches authentication code.';
export const meta = { cause: 'plan' as const, at: ISO };

export const add = (agent: string, after: string, id = 'dir-sec'): PipelineAdjustOp => ({
  op: 'add',
  stage: { id, kind: 'agent', label: 'Security', agent },
  after,
  reason: WHY,
});

export const remove = (stage_id: string): PipelineAdjustOp => ({
  op: 'remove',
  stage_id,
  reason: WHY,
});

export const swap = (
  stage_id: string,
  agent: string,
  member_id?: string,
): PipelineAdjustOp => ({
  op: 'swap',
  stage_id,
  ...(member_id === undefined ? {} : { member_id }),
  agent,
  reason: WHY,
});

/** Applies `ops` to `def` under the fixture roster, with the stages in `extra` routed or already started. */
export const apply = (
  def: PipelineDefinition,
  ops: PipelineAdjustOp[],
  lane: 'standard' | 'full' = 'standard',
  extra: { routed?: string[]; frozen?: string[] } = {},
) => applyAdjustments(def, ops, { ...ctx(lane), ...extra }, meta);

export const ids = (def: PipelineDefinition): string[] => def.stages.map((s) => s.id);
export const at = (def: PipelineDefinition, i: number): Stage => def.stages[i] as Stage;
