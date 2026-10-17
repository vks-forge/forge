/**
 * Shapes the stage runner passes between its parts.
 *
 * Why: running a ticket through a pipeline takes several small steps (read the ticket's stage
 *   state, start a writer or a check, run a script in the background, record what a stage was
 *   shown) in separate files. They hand each other a few records, and naming them here keeps each
 *   file about its own rule. A script job is process-local like a gate job: the rows are the
 *   truth, the job map only says a command is running now, so a restart finds a `running` row
 *   with no job and runs the command again.
 *
 * Exports: WriterChoice, CustomScriptRun, StageTarget, SendBackArgs, AttemptKey, StageState, StageJob, StageJobOutcome, ArtifactDraft, CollectInput, G1Result, VerifyHooks, StageTicket.
 * Depends on: @forge/core (stage types, gate types), types/engine-state, types/verify. Types only.
 */

import type {
  AgentStage,
  ArtifactKind,
  ScriptGateStage,
  StageOutcome,
  Cursor,
  GateVerdict,
  Run,
  StageRun,
  Ticket,
  TicketPipeline,
} from '@forge/core';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { ResolvedAgent } from '#/types/run-agent.types.js';
import type { GateRows, VerifyTarget } from '#/types/verify.types.js';

/** What identifies a stage attempt, and who runs it. */
export interface AttemptKey {
  readonly ticket_id: string;
  readonly stage_id: string;
  readonly member_id: string;
  readonly cycle: number;
  readonly kind: StageRun['kind'];
  readonly agent_id?: string;
  readonly agent_hash?: string;
  readonly run_id?: string;
}

/** A ticket's pipeline as the rows say it stands: the snapshot, every attempt, the cycle and what is next. */
export interface StageState {
  readonly snapshot: TicketPipeline;
  readonly records: StageRun[];
  readonly cycle: number;
  readonly cursor: Cursor;
}

/** How a background script ended; the stage row is written when a tick consumes it. */
export type StageJobOutcome =
  | { readonly ok: true; readonly verdict: GateVerdict }
  | { readonly ok: false; readonly error: unknown };

/** One script (a script gate or the red proof) running beside the tick. */
export interface StageJob {
  readonly ticketId: string;
  readonly stageRunId: number;
  /** `proof` for the red proof of a tester stage, `gate` for a script gate member. */
  readonly purpose: 'proof' | 'gate';
  outcome?: StageJobOutcome;
  /** Settles when the script is done and the outcome is set (tests and shutdown await it). */
  done: Promise<void>;
}

/** An artifact ready to store: capped, hashed. */
export interface ArtifactDraft {
  readonly kind:
    | 'plan'
    | 'ticket'
    | 'diff'
    | 'finish_claims'
    | 'narrative'
    | 'test_report'
    | 'findings'
    | 'gate_report';
  readonly content: string;
  readonly truncated: boolean;
  readonly sha256: string;
}

/** What the caller already holds for the artifacts that need IO. */
export interface CollectInput {
  readonly ticket: Ticket;
  /** The last writer's run: its finish event gives the claims and the narrative. */
  readonly run: Run;
  readonly kinds: readonly ArtifactKind[];
  /** The unified patch of the worktree against its base, read by the caller (a git call). */
  readonly diff?: string | undefined;
}

/** A stage result that stops the merge: which attempt, what to tell the next Worker, what to store. */
export interface SendBackArgs {
  readonly stage: {
    readonly id: string;
    readonly member: string;
    readonly kind: 'agent' | 'script_gate';
  };
  /** What the owner reads for the stage ("Review", "Gate G1"). */
  readonly label: string;
  /** The findings as text; they travel in the continuation wake, so the next Worker prompt carries them. */
  readonly findings: string;
  readonly outcome: StageOutcome;
  readonly rows?: GateRows;
  /** The stage's own attempt row when one is already open (a check run's), else one is written. */
  readonly rowId?: number;
  readonly agent?: { readonly id: string; readonly hash?: string | undefined };
}

/** What running the gates for the ticket's G1 stage came to this tick. */
export type G1Result =
  | { readonly kind: 'pass'; readonly rows: GateRows; readonly report?: string }
  | { readonly kind: 'handled' };

/** The pieces of the verify phase the stage runner drives; verify.ts supplies them. */
export interface VerifyHooks {
  /** Publishes, gates or reads the stored verdicts for the G1 stage. */
  readonly g1: (ctx: EngineCtx, t: VerifyTarget) => Promise<G1Result>;
  /** The latest gate rows of the target's run. */
  readonly rows: (ctx: EngineCtx, t: VerifyTarget) => Promise<GateRows>;
  /** The merge door: merges tier A, holds B/C or a human stage; handles a moved head. */
  readonly merge: (
    ctx: EngineCtx,
    t: VerifyTarget,
    rows: GateRows,
    hold: boolean,
  ) => Promise<void>;
}

/** A ticket and what the stage runner needs to act on it. */
export interface StageTicket {
  readonly ticket: Ticket;
  readonly state: StageState;
}

/** The command form of a script gate (the owner's own command, not G1). */
export type CustomScriptRun = Extract<ScriptGateStage['run'], { command: string }>;

/** What a stage result concerns: the ticket and the writer run the gates and the merge judge. */
export type StageTarget = Pick<VerifyTarget, 'ticket' | 'run'>;

/** The writer a dispatch starts: the agent, its stage and the pipeline state (null for work from before pipelines), or nothing. */
export type WriterChoice =
  | { readonly kind: 'stop' }
  | {
      readonly kind: 'go';
      readonly agent: ResolvedAgent;
      readonly stage?: AgentStage;
      readonly state: StageState | null;
    };
