/**
 * Check result types shared by every G1 check.
 *
 * Why: G1 is several independent checks (claims, receipt chain, test diff, config guard,
 *   project commands). The gate folds them into one verdict and one readable report, so
 *   each check must hand back the same shape: a status, structured findings for the
 *   engine and a markdown section for the Worker's rework prompt. A shared shape is what
 *   lets the gate add a check without touching how verdicts are combined.
 *
 * Exports: CheckOutcome, PatchFile, PatchDraft, ClaimEvidence, ProjectCheckInput, ProjectCheckSteps, AllowedCall.
 * Depends on: @forge/core, @forge/tools, types/g1-deps. Types only.
 */

import type { GateFinding, GateStatus, ProjectConfig, WorktreeDiff } from '@forge/core';
import type { DecisionReceipt, Receipt } from '@forge/tools';
import type { ResolvedRules } from '#/types/ecosystem.types.js';
import type { RunCommand } from '#/types/g1-deps.types.js';

/** What one check concluded; `error` means the check could not run, never "passed". */
export interface CheckOutcome {
  readonly name: string;
  readonly status: GateStatus;
  readonly findings: readonly GateFinding[];
  /** Markdown body of this check's report section. */
  readonly details: string;
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

/** The evidence the claim matcher compares claims against. */
export interface ClaimEvidence {
  /** The gated run's own receipts: the only evidence for read, ran_tests and added_test. */
  readonly receipts: readonly Receipt[];
  /**
   * Receipts of the ticket's earlier runs. They support `edited` claims only: the edit is
   * in the branch diff already, but tests or reads from before a rework prove nothing
   * about the reworked code.
   */
  readonly earlierReceipts?: readonly Receipt[];
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
