/**
 * Run the gates on a published run and record one `gate_results` row each.
 *
 * Why: a ticket may merge only on verdicts from processes the Worker does not control.
 *   Each gate gets the same context (ticket, run, real worktree, base sha and the claims
 *   the Worker made in `finish`), its report is saved, and its verdict is stored as a row
 *   before anything is decided, so the decision, the Ticket screen and a restart all read
 *   the same record. A gate that throws is recorded as `error`, never as a pass; the
 *   thrown family is kept so the caller can tell a rate limit from a broken gate.
 *
 * Exports: readClaims(), runGates().
 * Depends on: @forge/core (Claim, errors), domain/results, shared/time. IO through ports.
 */

import { Claim, InvalidInputError } from '@forge/core';
import type { ErrorFamily, GateResult, GateVerdict } from '@forge/core';
import { z } from 'zod';
import { familyOf } from '#/domain/results.js';
import { iso } from '#/shared/time.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { GateRun, VerifyTarget } from '#/types/verify.types.js';

const FinishClaims = z.object({ claims: z.array(Claim) });

/** The claims of the run's `finish` event; none when it never finished. A malformed list fails closed. */
export async function readClaims(ctx: EngineCtx, runId: string): Promise<Claim[]> {
  const events = await ctx.deps.storage.transaction((tx) =>
    tx.runEvents.listByRun(runId),
  );

  for (const e of [...events].reverse()) {
    if (e.type !== 'finish') {
      continue;
    }

    if (e.structured === undefined) {
      return [];
    }

    const parsed = FinishClaims.safeParse(e.structured);
    if (!parsed.success) {
      throw new InvalidInputError(`run ${runId} has malformed finish claims`);
    }

    return parsed.data.claims;
  }

  return [];
}

/** Runs every configured gate in order, saving report and row for each. */
export async function runGates(
  ctx: EngineCtx,
  t: VerifyTarget,
  claims: readonly Claim[],
): Promise<GateRun> {
  const { deps } = ctx;
  const rows: GateResult[] = [];
  const verdicts = new Map<string, GateVerdict>();
  let errorFamily: ErrorFamily | undefined;

  for (const gate of t.runtime.gates) {
    const startedAt = iso(deps.clock.now());
    let verdict: GateVerdict;
    try {
      verdict = await gate.run({
        ticket: t.ticket,
        run: t.run,
        project: t.runtime.config,
        worktreePath: t.worktree,
        baseSha: t.baseSha,
        claims,
      });
    } catch (e) {
      errorFamily ??= familyOf(e);
      verdict = {
        status: 'error',
        findings: [],
        report: `gate ${gate.name} could not run: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    const ref = await deps.reports.put(t.run.id, `${gate.name}.txt`, verdict.report);
    const row = await deps.storage.transaction((tx) =>
      tx.gateResults.insert({
        run_id: t.run.id,
        gate: gate.name,
        status: verdict.status,
        ...(ref ? { report_ref: ref } : {}),
        started_at: startedAt,
        ended_at: iso(deps.clock.now()),
      }),
    );

    rows.push(row);
    verdicts.set(gate.name, verdict);
    deps.log?.('info', `gate ${gate.name} ${verdict.status} for ${t.ticket.id}`, {
      run: t.run.id,
    });
  }

  return { rows, verdicts, ...(errorFamily ? { errorFamily } : {}) };
}
