/**
 * Check result types shared by every G1 check.
 *
 * Why: G1 is several independent checks (claims, receipt chain, test diff, config guard,
 *   project commands). The gate folds them into one verdict and one readable report, so
 *   each check must hand back the same shape: a status, structured findings for the
 *   engine and a markdown section for the Worker's rework prompt. A shared shape is what
 *   lets the gate add a check without touching how verdicts are combined.
 *
 * Exports: CheckOutcome, PatchFile, PatchDraft, ClaimEvidence, EarlierRunEvidence, UnverifiedEarlierRun, SetAsideCode, SetAside, RawEarlierRun, Coverage, ProjectCheckInput, ProjectCheckSteps, AllowedCall, ReadBacking.
 * Depends on: @forge/core, @forge/tools, types/g1-deps. Types only.
 */

import type { GateFinding, GateStatus, ProjectConfig, WorktreeDiff } from '@forge/core';
import type { DecisionReceipt, HmacKey, Receipt } from '@forge/tools';
import type { ResolvedRules } from '#/types/ecosystem.types.js';
import type { RunCommand } from '#/types/g1-deps.types.js';

/** What one check concluded; `error` means the check could not run, never "passed". */
export interface CheckOutcome {
  readonly name: string;
  readonly status: GateStatus;
  readonly findings: readonly GateFinding[];
  /** Markdown body of this check's report section. */
  readonly details: string;
  /** Claims only: every finding is a lost-proof finding for a file (see `Coverage.provenanceFiles`). */
  readonly provenanceOnly?: boolean;
}

/** One file of a unified patch: its added and removed lines without the +/- marker. */
export interface PatchFile {
  readonly path: string;
  readonly deleted: boolean;
  /** Git printed "Binary files ... differ": the hunks are not in the patch. */
  readonly binary: boolean;
  /** Set when the `diff --git` header could not be parsed; `path` is then the raw header. */
  readonly unparsed?: true;
  readonly added: readonly string[];
  readonly removed: readonly string[];
}

/** Mutable accumulator the patch parser fills while reading one file's hunks. */
export interface PatchDraft {
  path: string;
  deleted: boolean;
  binary: boolean;
  unparsed?: true;
  added: string[];
  removed: string[];
}

/** One earlier run of the ticket with its verified receipts. */
export interface EarlierRunEvidence {
  readonly runId: string;
  readonly receipts: readonly Receipt[];
}

/** An earlier run as read from storage: its receipts and the secrets still held for it. */
export interface RawEarlierRun {
  readonly runId: string;
  readonly receipts: readonly Receipt[];
  readonly secrets: ReadonlyMap<number, HmacKey>;
}

/** What coverage found: findings, and which earlier run covered which unclaimed file. */
export interface Coverage {
  readonly findings: GateFinding[];
  readonly coveredByEarlier: ReadonlyMap<string, string>;
  /** Files whose only cover is an earlier run whose run secret is gone; each has its own finding with `file` set. */
  readonly provenanceFiles: readonly string[];
}

/** Why an earlier run was set aside: its run secret is gone, or its chain did not verify (broken or forged). */
export type SetAsideCode = 'secret_gone' | 'chain_broken';

/** The structured outcome of failing to verify an earlier run: the code and a plain-words reason. */
export interface SetAside {
  readonly code: SetAsideCode;
  readonly reason: string;
}

/**
 * An earlier run G1 set aside because its chain did not verify. `receipts` are the unverified
 * records, read only to say which files the run claims to have edited (never as cover).
 */
export interface UnverifiedEarlierRun {
  readonly runId: string;
  readonly code: SetAsideCode;
  readonly reason: string;
  readonly receipts: readonly Receipt[];
}

/** The evidence the claim matcher compares claims against. */
export interface ClaimEvidence {
  /** The gated run's own receipts: the only evidence for read, ran_tests and added_test. */
  readonly receipts: readonly Receipt[];
  /**
   * Earlier runs of the ticket whose receipt chains verified. They back `edited` and `read`
   * claims and cover files they edited (those edits are in the branch already); tests run
   * before a rework prove nothing about the reworked code, so ran_tests ignores them.
   */
  readonly earlierRuns?: readonly EarlierRunEvidence[];
  /** Earlier runs whose chain could not be verified; they back nothing, and the report says why. */
  readonly unverifiedEarlierRuns?: readonly UnverifiedEarlierRun[];
  readonly diff: WorktreeDiff;
  readonly patch: readonly PatchFile[];
  /** Commands of every test-role check; a shell receipt matching any of them backs `ran_tests`. */
  readonly testCommands: readonly string[];
  /** Resolved ecosystem rules (what a test file and a test declaration look like); all ecosystems when absent. */
  readonly rules?: ResolvedRules;
  readonly worktreePath: string;
}

export interface ProjectCheckInput {
  readonly project: ProjectConfig;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Extra variable names to copy from `env` beyond the built-in allowlist. */
  readonly passEnv?: readonly string[] | undefined;
  readonly run: RunCommand;
  readonly timeoutMs: number;
  /** The project's tool folders from the worktree's prep record; go first on PATH and may be run from. */
  readonly pathDirs?: readonly string[] | undefined;
}

/** Accumulator for the report lines and findings of the project commands. */
export interface ProjectCheckSteps {
  readonly lines: string[];
  readonly findings: GateFinding[];
  errored: boolean;
}

/** An allowed decision receipt paired with the state of its effect receipt, if any. */
export interface AllowedCall {
  readonly decision: DecisionReceipt;
  readonly state: string | undefined;
}

/** What backs a `read` claim: the file itself (`folder` null) or the folder a search covered. */
export interface ReadBacking {
  readonly folder: string | null;
}
