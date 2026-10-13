/**
 * G1 gate — claims, receipts, test integrity and project checks in one verdict.
 *
 * Why: after a Worker finishes, the Director must not take its word for what it did.
 *   G1 is the cheapest independent check and runs first in every lane: it matches the
 *   Worker's `finish` claims against HMAC-chained tool receipts and the git diff, proves
 *   the receipts are intact and complete, refuses test or config tampering, and re-runs
 *   lint, typecheck and tests itself. Any finding fails the gate and the report goes back
 *   to the Worker as the rework prompt. A check that could not run (missing run secret,
 *   spawn failure) makes the verdict `error`, never `passed`, so the engine retries or
 *   escalates instead of merging on missing evidence (verification-plane.md §2).
 *
 * Exports: createG1Gate().
 * Depends on: @forge/core (Gate), domain/*, adapters/command-runner, types/g1-deps. IO only via injected deps.
 */

import type { Gate, GateContext, GateFinding, GateVerdict } from '@forge/core';
import { runShellCommand } from '#/adapters/command-runner.js';
import { checkChain } from '#/domain/chain-check.js';
import { checkClaims } from '#/domain/claim-check.js';
import { checkGateConfig } from '#/domain/config-guard.js';
import { parsePatch } from '#/domain/patch.js';
import { DEFAULT_COMMAND_TIMEOUT_MS, runProjectChecks } from '#/domain/project-checks.js';
import { renderReport } from '#/domain/report.js';
import { checkTestDiff } from '#/domain/test-diff.js';
import type { CheckOutcome } from '#/types/check.types.js';
import type { G1Deps } from '#/types/g1-deps.types.js';

function combine(outcomes: readonly CheckOutcome[]): GateVerdict['status'] {
  if (outcomes.some((o) => o.findings.length > 0 || o.status === 'failed')) {
    return 'failed';
  }

  return outcomes.some((o) => o.status === 'error') ? 'error' : 'passed';
}

/** Builds the G1 gate over injected evidence sources and a command runner. */
export function createG1Gate(deps: G1Deps): Gate {
  const now = deps.now ?? ((): Date => new Date());
  const run = deps.runCommand ?? runShellCommand;
  const timeoutMs = deps.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;

  return {
    name: 'G1',
    async run(ctx: GateContext): Promise<GateVerdict> {
      const runId = ctx.run.id;
      const [receipts, calls, diff] = await Promise.all([
        deps.receipts.list(runId),
        deps.listToolCalls(runId),
        deps.worktrees.diff(ctx.worktreePath, ctx.baseSha),
      ]);

      const patch = parsePatch(diff.patch);
      const toolCalls = calls.filter((c) => !deps.ignoreToolCall?.(c));
      const outcomes: CheckOutcome[] = [
        checkChain(receipts, toolCalls, deps.runSecret(runId)),
        checkClaims(ctx.claims, {
          receipts,
          diff,
          patch,
          testCommand: ctx.project.commands.test,
          worktreePath: ctx.worktreePath,
        }),
        checkTestDiff(diff, patch),
        checkGateConfig(diff, patch, ctx.project.commands),
        await runProjectChecks({
          project: ctx.project,
          cwd: ctx.worktreePath,
          env: deps.env,
          run,
          timeoutMs,
        }),
      ];

      const findings: GateFinding[] = outcomes.flatMap((o) => [...o.findings]);
      const status = combine(outcomes);

      return {
        status,
        findings,
        report: renderReport(status, outcomes, now()),
      };
    },
  };
}
