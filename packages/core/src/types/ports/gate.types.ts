/**
 * Gate port — one independent check on a finished run.
 *
 * Why: a ticket may only merge on evidence produced by processes the Worker does not
 *   control. Every gate (G1 claims and receipts, later G2-G6) takes the same context and
 *   returns the same verdict shape, so the engine runs them in a loop, stores one
 *   `gate_results` row each and decides pass or rework from the statuses alone. The
 *   context carries data, not receipt types: a gate that needs the receipt log gets it
 *   injected at construction, which keeps core free of tools-ring types.
 *
 * Exports: GateContext, GateFinding, GateVerdict, Gate.
 * Depends on: schemas/{claims,gate-result,project,run,ticket}. Types only.
 */

import type { Claim } from '#/schemas/claims.js';
import type { GateName, GateStatus } from '#/schemas/gate-result.js';
import type { ProjectConfig } from '#/schemas/project.js';
import type { Run } from '#/schemas/run.js';
import type { Ticket } from '#/schemas/ticket.js';

/** Everything a gate may look at: the ticket, the run being judged, and the real worktree. */
export interface GateContext {
  readonly ticket: Ticket;
  readonly run: Run;
  readonly project: ProjectConfig;
  readonly worktreePath: string;
  readonly baseSha: string;
  /** The claims the Worker made in `finish`. */
  readonly claims: readonly Claim[];
}

/** One failed (or noteworthy) check; `claim` is set when a Worker claim was unsupported. */
export interface GateFinding {
  readonly check: string;
  readonly message: string;
  readonly claim?: Claim;
}

export interface GateVerdict {
  readonly status: GateStatus;
  readonly findings: readonly GateFinding[];
  /** Human-readable report stored behind `gate_results.report_ref`. */
  readonly report: string;
}

export interface Gate {
  readonly name: GateName;
  run(ctx: GateContext): Promise<GateVerdict>;
}
