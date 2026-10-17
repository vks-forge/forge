/**
 * Fixtures for the stage cursor suites: the role map, snapshots of the shipped lanes and a row builder.
 *
 * Why: the cursor is tested from several angles (walks, rework cycles, groups, fail-closed cases,
 *   properties). They must all build stage rows and snapshots the same way, or a drift in one suite's
 *   idea of "a passed implementer row" would hide a bug in another's.
 *
 * Exports: roles, snap, standard, full, row, next, kindOf.
 * Depends on: src/domain/{stage-cursor,builtin-pipelines}. No IO.
 */

import { BUILTIN_PIPELINES } from '#/domain/builtin-pipelines.js';
import { currentCycle, stageCursor } from '#/domain/stage-cursor.js';
import type { PipelineDefinition } from '#/schemas/pipeline.js';
import type { StageRunStatus } from '#/schemas/stage-run.js';
import type { SnapshotView, StageRecord } from '#/types/stage-cursor.types.js';

export const roles = {
  implementer: 'writer',
  'test-writer': 'tester',
  reviewer: 'reviewer',
  critic: 'reviewer',
} as const;

export const snap = (def: PipelineDefinition): SnapshotView => ({
  definition: def,
  roles,
});
export const standard = snap(BUILTIN_PIPELINES.standard);
export const full = snap(BUILTIN_PIPELINES.full);

export const row = (
  stage_id: string,
  status: StageRunStatus,
  over: Partial<StageRecord> = {},
): StageRecord => ({
  stage_id,
  member_id: '',
  cycle: 0,
  kind: stage_id === 'human' ? 'human' : 'agent',
  status,
  outcome: {},
  ...over,
});

export const next = (s: SnapshotView, records: StageRecord[]) =>
  stageCursor(s, records, currentCycle(records));

export const kindOf = (s: SnapshotView, records: StageRecord[]): string =>
  next(s, records).kind;
