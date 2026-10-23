/**
 * G1 gate — claims, receipts, test integrity and project checks in one verdict.
 *
 * Why: after a Worker finishes, the Director must not take its word for what it did.
 *   G1 is the cheapest independent check and runs first in every lane: it matches the
 *   Worker's `finish` claims against HMAC-chained tool receipts and the git diff, proves
 *   the receipts are intact and complete, refuses test or config tampering, unresolved merge-conflict markers and changes outside the project folder, and re-runs
 *   every configured check (tests, lint, typecheck, build, ...) itself. Any finding fails the gate and the report goes back
 *   to the Worker as the rework prompt. A check that could not run (missing run secret,
 *   spawn failure) makes the verdict `error`, never `passed`, so the engine retries or
 *   escalates instead of merging on missing evidence (verification-plane.md §2).
 *
 *   A run that was resumed after a restart is verified generation by generation, each segment
 *   with its own secret (d-0100); a missing secret or link fails the gate.
 *
 *   A rework run reuses the ticket's branch, so earlier runs of the ticket count too, once
 *   their own chains verify (domain/earlier-runs): their edit receipts cover files they
 *   changed and back `edited` and `read` claims. Tests run before a rework say nothing about
 *   the reworked code, so ran_tests needs this run's own receipt, and the chain check that
 *   gates the verdict is this run's.
 *
 *   When an earlier run's secret is gone, files only it edited get a finding that tells the Worker to re-apply them, and a verdict whose only problem is that is `provenanceOnly` (F-D2, F-D3).
 *
 *   Checks run with the tool folders the worktree's setup recorded (a virtual environment's `bin`) first on PATH, so `pytest` is the project's own.
 *
 * Exports: buildG1Gate().
 * Depends on: @forge/core (Gate), @forge/tools (Receipt type), domain/* (earlier-runs verifies earlier chains, gate-rules picks the ecosystem rules, conflict-markers refuses added merge markers), types/g1-deps. No IO; every side effect is an injected dep.
 */

import type { Gate, GateContext, GateFinding, GateVerdict } from '@forge/core';
import { checkChain, recordedGenerations } from '#/domain/chain-check.js';
import { checkClaims } from '#/domain/claim-check.js';
import { checkConflictMarkers } from '#/domain/conflict-markers.js';
import { checkGateConfig } from '#/domain/config-guard.js';
import { resolveRules } from '#/domain/gate-rules.js';
import { verifyEarlierRuns } from '#/domain/earlier-runs.js';
import { parsePatch } from '#/domain/patch.js';
import { DEFAULT_COMMAND_TIMEOUT_MS, runProjectChecks } from '#/domain/project-checks.js';
import { checkScope } from '#/domain/scope-check.js';
import { renderReport } from '#/domain/report.js';
import { checkTestDiff } from '#/domain/test-diff.js';
import type { HmacKey } from '@forge/tools';
import type { CheckOutcome } from '#/types/check.types.js';
import type { G1CoreDeps } from '#/types/g1-deps.types.js';

function combine(outcomes: readonly CheckOutcome[]): GateVerdict['status'] {
  if (outcomes.some((o) => o.findings.length > 0 || o.status === 'failed')) {
    return 'failed';
  }

  return outcomes.some((o) => o.status === 'error') ? 'error' : 'passed';
}

/**
 * True when gate-config is the only check that did not pass and no check errored: the one
 * failure the owner, not a rework, can settle (d-0173). Anything else is the ordinary road.
 */
function configOnly(outcomes: readonly CheckOutcome[]): boolean {
  const bad = outcomes.filter((o) => o.status !== 'passed' || o.findings.length > 0);

  return (
    bad.length > 0 && bad.every((o) => o.name === 'gate-config' && o.status === 'failed')
  );
}

/**
 * True when the claims check is the only check that did not pass, no check errored, and every one
 * of its findings is a lost earlier-run proof for a file (F-D3): a rework can re-apply the files,
 * and when it cannot the owner can vouch. Anything else is the ordinary road.
 */
function provenanceOnly(outcomes: readonly CheckOutcome[]): boolean {
  const bad = outcomes.filter((o) => o.status !== 'passed' || o.findings.length > 0);

  return (
    bad.length > 0 &&
    bad.every(
      (o) => o.name === 'claims' && o.status === 'failed' && o.provenanceOnly === true,
    )
  );
}

/** The ticket's earlier runs with their receipts, chain-verified under their own secrets. */
async function earlierRuns(
  deps: G1CoreDeps,
  ctx: GateContext,
): Promise<ReturnType<typeof verifyEarlierRuns>> {
  const ids = deps.earlierRunIds ? await deps.earlierRunIds(ctx.run) : [];
  const raw = await Promise.all(
    ids.map(async (runId) => {
      const receipts = await deps.receipts.list(runId);

      return {
        runId,
        receipts,
        secrets: await generationSecrets(deps, runId, recordedGenerations(receipts)),
      };
    }),
  );

  return verifyEarlierRuns(raw);
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
        earlierRuns(deps, ctx),
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
          earlierRuns: earlier.verified,
          unverifiedEarlierRuns: earlier.unverified,
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
        checkConflictMarkers(patch),
        await runProjectChecks({
          project: ctx.project,
          cwd: ctx.worktreePath,
          env: deps.env,
          passEnv: deps.passEnv,
          pathDirs: (await deps.worktrees.readPrep?.(ctx.worktreePath))?.path ?? [],
          run,
          timeoutMs,
        }),
      ];

      const findings: GateFinding[] = outcomes.flatMap((o) => [...o.findings]);
      const status = combine(outcomes);

      return {
        status,
        findings,
        ...(configOnly(outcomes) ? { configOnly: true } : {}),
        ...(provenanceOnly(outcomes) ? { provenanceOnly: true } : {}),
        report: renderReport(status, outcomes, now()),
      };
    },
  };
}
