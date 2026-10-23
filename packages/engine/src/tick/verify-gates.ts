/**
 * Run the gates on a published run and record one `gate_results` row each.
 *
 * Why: a ticket may merge only on verdicts from processes the Worker does not control.
 *   Each gate gets the same context (ticket, run, real worktree, base sha and the claims
 *   the Worker made in `finish`), its report is saved, and its verdict is stored as a row
 *   before anything is decided, so the decision, the Ticket screen and a restart all read
 *   the same record. Each row also records the commit the gates judged, so a merge can be
 *   pinned to it. A gate that throws is recorded as `error`, never as a pass; the
 *   thrown family is kept so the caller can tell a rate limit from a broken gate. Before the gates, the
 *   tree's packages are brought up to date: an install the Worker broke by editing a lockfile is a failed
 *   `setup` gate sent back with the output; any other setup failure is a fault, not a verdict.
 *
 * Exports: readClaims(), runGates().
 * Depends on: @forge/core (Claim, errors), domain/results, schemas/finish-claims, shared/time, tick/prep-checks.
 *   IO through ports.
 */

import { InvalidInputError } from '@forge/core';
import type { Claim, ErrorFamily, GateResult, GateVerdict } from '@forge/core';
import { familyOf } from '#/domain/results.js';
import { FinishClaims } from '#/schemas/finish-claims.js';
import { prepareForChecks, SETUP_GATE, setupVerdict } from '#/tick/prep-checks.js';
import { iso } from '#/shared/time.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { EngineDeps } from '#/types/engine.types.js';
import type { GateRun, VerifyTarget } from '#/types/verify.types.js';

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
  deps: EngineDeps,
  t: VerifyTarget,
  claims: readonly Claim[],
  headSha: string,
): Promise<GateRun> {
  const rows: GateResult[] = [];
  const verdicts = new Map<string, GateVerdict>();
  let errorFamily: ErrorFamily | undefined;

  // The Worker may have changed what the packages come from: bring them up to date first. Its own
  // broken change is a failed `setup` gate (rework); a failure it did not cause is a fault to retry or park.
  const setup = await prepareForChecks(t.runtime, t.worktree, t.baseSha);
  if (setup) {
    if (!setup.inputs_changed_by_worker) {
      throw new InvalidInputError(setupVerdict(setup).report);
    }

    const verdict = setupVerdict(setup);
    const startedAt = iso(deps.clock.now());
    const ref = await deps.reports.put(t.run.id, `setup-${headSha}.txt`, verdict.report);
    const row = await deps.storage.transaction((tx) =>
      tx.gateResults.insert({
        run_id: t.run.id,
        gate: SETUP_GATE,
        status: verdict.status,
        ...(ref ? { report_ref: ref } : {}),
        head_sha: headSha,
        started_at: startedAt,
        ended_at: iso(deps.clock.now()),
      }),
    );

    return { rows: [row], verdicts: new Map([[SETUP_GATE, verdict]]) };
  }

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

    // The head sha in the name keeps a re-run on a new head from replacing the earlier report.
    const ref = await deps.reports.put(
      t.run.id,
      `${gate.name}-${headSha}.txt`,
      verdict.report,
    );

    const row = await deps.storage.transaction((tx) =>
      tx.gateResults.insert({
        run_id: t.run.id,
        gate: gate.name,
        status: verdict.status,
        ...(ref ? { report_ref: ref } : {}),
        head_sha: headSha,
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
