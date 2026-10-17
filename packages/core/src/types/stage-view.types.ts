/**
 * The shape of one stage on the ticket page's pipeline strip.
 *
 * Why: a group stage holds member stages, so the view is recursive, and a recursive zod schema
 *   needs its type written by hand. The ticket page and the HTTP reply both use this one shape:
 *   what each stage is, how far it got at the current rework cycle, who ran it and what it
 *   produced, so the owner can open any chip and see the findings and artifacts behind it.
 *
 * Exports: StageView, ViewContext.
 * Depends on: schemas/agent, schemas/pipeline, schemas/stage-run. Types only.
 */

import type { ArtifactKind } from '#/schemas/agent.js';
import type { Severity } from '#/schemas/pipeline.js';
import type { StageArtifact, StageRun, StageRunStatus } from '#/schemas/stage-run.js';

/** One stage as the strip draws it, rolled up from its attempts at the current cycle. */
export interface StageView {
  id: string;
  kind: 'agent' | 'script_gate' | 'group' | 'human' | 'merge';
  label: string;
  agent?: { id: string; name: string } | undefined;
  members?: StageView[] | undefined;
  status: StageRunStatus | 'pending';
  cycle: number;
  run_id?: string | undefined;
  started_at?: string | undefined;
  ended_at?: string | undefined;
  summary?: string | undefined;
  counts?: Record<Severity, number> | undefined;
  artifacts: { id: number; kind: ArtifactKind }[];
}

/** What the view of one stage reads: every attempt, the artifact index, the current cycle and which stages it runs again. */
export interface ViewContext {
  readonly records: readonly StageRun[];
  readonly artifacts: readonly Pick<StageArtifact, 'id' | 'stage_run_id' | 'kind'>[];
  readonly cycle: number;
  /** Ids of the stages the current cycle runs again. */
  readonly rerun: ReadonlySet<string>;
}
