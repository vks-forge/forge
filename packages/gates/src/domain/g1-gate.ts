/**
 * G1 gate — claims, receipts, test integrity and project checks in one verdict.
 *
 * Why: after a Worker finishes, the Director must not take its word for what it did.
 *   G1 is the cheapest independent check and runs first in every lane: it matches the
 *   Worker's `finish` claims against HMAC-chained tool receipts and the git diff, proves
 *   the receipts are intact and complete, refuses test or config tampering and changes outside the project folder, and re-runs
 *   every configured check (tests, lint, typecheck, build, ...) itself. Any finding fails the gate and the report goes back
 *   to the Worker as the rework prompt. A check that could not run (missing run secret,
 *   spawn failure) makes the verdict `error`, never `passed`, so the engine retries or
 *   escalates instead of merging on missing evidence (verification-plane.md §2).
 *
 *   A run that was resumed after a restart is verified generation by generation, each segment
 *   with its own secret (d-0100); a missing secret or link fails the gate.
 *
 *   Earlier runs of the ticket count only for `edited` claims; tests run or files read
 *   before a rework say nothing about the reworked code, and the chain check is own-run only.
 *
 * Exports: buildG1Gate().
 * Depends on: @forge/core (Gate), @forge/tools (Receipt type), domain/* (gate-rules picks the ecosystem rules), types/g1-deps. No IO; every side effect is an injected dep.
 */

import type { Gate, GateContext, GateFinding, GateVerdict } from '@forge/core';
import { checkChain, recordedGenerations } from '#/domain/chain-check.js';
import { checkClaims } from '#/domain/claim-check.js';
import { checkGateConfig } from '#/domain/config-guard.js';
import { resolveRules } from '#/domain/gate-rules.js';
import { parsePatch } from '#/domain/patch.js';
import { DEFAULT_COMMAND_TIMEOUT_MS, runProjectChecks } from '#/domain/project-checks.js';
import { checkScope } from '#/domain/scope-check.js';
import { renderReport } from '#/domain/report.js';
import { checkTestDiff } from '#/domain/test-diff.js';
import type { HmacKey, Receipt } from '@forge/tools';
import type { CheckOutcome } from '#/types/check.types.js';
import type { G1CoreDeps } from '#/types/g1-deps.types.js';

function combine(outcomes: readonly CheckOutcome[]): GateVerdict['status'] {
  if (outcomes.some((o) => o.findings.length > 0 || o.status === 'failed')) {
    return 'failed';
  }

  return outcomes.some((o) => o.status === 'error') ? 'error' : 'passed';
}

/** Receipts of the ticket's earlier runs; they back a rework run's `edited` claims only. */
async function earlierReceipts(deps: G1CoreDeps, ctx: GateContext): Promise<Receipt[]> {
  const ids = deps.earlierRunIds ? await deps.earlierRunIds(ctx.run) : [];
  const lists = await Promise.all(ids.map((id) => deps.receipts.list(id)));

  return lists.flat();
}

/** The secret of every generation the run reached (its row's and its chain's), where one exists. */
async function generationSecrets(
  deps: G1CoreDeps,
  runId: string,
  generations: number,
): Promise<ReadonlyMap<number, HmacKey>> {
  const secrets = new Map<number, HmacKey>();
  for (let g = 1; g <= generations; g++) {
    const secret = await deps.runSecrets(runId, g);
    if (secret !== null) {
      secrets.set(g, secret);
    }
  }

  return secrets;
}

/** Builds the G1 gate over injected evidence sources and a required command runner. */
export function buildG1Gate(deps: G1CoreDeps): Gate {
  const now = deps.now ?? ((): Date => new Date());
  const run = deps.runCommand;
  const timeoutMs = deps.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;

  return {
    name: 'G1',
    async run(ctx: GateContext): Promise<GateVerdict> {
      const runId = ctx.run.id;
      const [receipts, calls, diff, earlier] = await Promise.all([
        deps.receipts.list(runId),
        deps.listToolCalls(runId),
        deps.worktrees.diff(ctx.worktreePath, ctx.baseSha),
        earlierReceipts(deps, ctx),
      ]);

      const runGeneration = ctx.run.generation ?? 1;
      const secrets = await generationSecrets(
        deps,
        runId,
        Math.max(runGeneration, recordedGenerations(receipts)),
      );

      const patch = parsePatch(diff.patch);
      const rules = resolveRules(
        ctx.project,
        diff.files.flatMap((f) =>
          f.oldPath === undefined ? [f.path] : [f.path, f.oldPath],
        ),
      );

      const toolCalls = calls.filter((c) => !deps.ignoreToolCall?.(c));
      const outcomes: CheckOutcome[] = [
        checkChain(receipts, toolCalls, secrets, runGeneration),
        checkClaims(ctx.claims, {
          receipts,
          earlierReceipts: earlier,
          diff,
          patch,
          testCommands: ctx.project.checks
            .filter((c) => c.role === 'test')
            .map((c) => c.command),
          rules,
          worktreePath: ctx.worktreePath,
        }),
        checkScope(diff),
        checkTestDiff(diff, patch, rules),
        checkGateConfig(diff, patch, ctx.project.checks, rules),
        await runProjectChecks({
          project: ctx.project,
          cwd: ctx.worktreePath,
          env: deps.env,
          passEnv: deps.passEnv,
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
