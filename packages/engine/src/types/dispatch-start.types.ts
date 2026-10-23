/**
 * Shapes of a Worker run start that is split in two: the brief beside the tick, the launch in it.
 *
 * Why: before a Worker run can start, Forge cuts its worktree, gets it ready and has the Director
 *   write the brief, which is a model call of seconds to minutes. That work runs as a job so the tick
 *   (settle, stall scan, other tickets' runs) never waits on it, and the run itself is started by the
 *   next tick once it has checked the ticket still wants it. The two halves share what the tick
 *   decided before the job began (the writer, the harness, the branch), and the job hands back what
 *   it produced; these types are that hand-over.
 *
 * Exports: StartPlan, Briefed, Launchable.
 * Depends on: @forge/core (Interaction, Project, Run, WorkerDriver, Worktree), types/{approval,
 *   director-jobs,retry-context,run-agent,stage-runner,tick,verify}. Types only.
 */

import type { Interaction, Project, Run, WorkerDriver, Worktree } from '@forge/core';
import type { ApprovalAnswer } from '#/types/approval.types.js';
import type { DirectorApply } from '#/types/director-jobs.types.js';
import type { RetryContext } from '#/types/retry-context.types.js';
import type { ResolvedAgent } from '#/types/run-agent.types.js';
import type { StageState } from '#/types/stage-runner.types.js';
import type { Candidate } from '#/types/tick.types.js';
import type { ProjectRuntime } from '#/types/verify.types.js';

/** What the tick settled before the brief job starts: who runs, where, on what, after which run. */
export interface StartPlan {
  readonly candidate: Candidate;
  readonly project: Project;
  readonly runtime: ProjectRuntime;
  /** The run this one continues (a retry, a resume, a permission answer), if any. */
  readonly previous: Run | null;
  /** The answered question a resume follows. */
  readonly answered: Interaction | null;
  readonly approvals: ApprovalAnswer[];
  /** Why the ticket stopped and what the last attempt left, for a retry's brief; null with no history or no retry. */
  readonly retry: RetryContext | null;
  readonly agent: ResolvedAgent;
  readonly stage?: { readonly id: string; readonly label: string };
  readonly memberId?: string;
  readonly state: StageState | null;
  readonly harness: string;
  readonly driver: WorkerDriver;
  readonly branch: string;
}

/** What the brief job produced: a run ready to launch, a park for the tick to apply, or nothing to do now. */
export type Briefed =
  | {
      readonly kind: 'launch';
      readonly wt: Worktree;
      readonly prompt: string;
      readonly pathPrepend: string[];
    }
  | { readonly kind: 'park'; readonly park: DirectorApply }
  | { readonly kind: 'wait' };

/** The brief of a run that is ready to launch. */
export type Launchable = Extract<Briefed, { kind: 'launch' }>;
