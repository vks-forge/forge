/**
 * Launches one Worker run: run row, token, request, harness start, pump.
 *
 * Why: the run row and the per-run token (stored only as a hash) are written together before the
 *   harness starts, so a crash after the start leaves a run the restart rule can find and revoke
 *   (d-0054); the brief is stored as the run's first `prompt` event in that same transaction, and
 *   any stage rows the caller needs (the attempt this run carries, the artifacts it was shown) land
 *   there too, so a stage never exists without its run or the other way round. A start that throws
 *   settles the run as a failure and the error family decides retry or park. This is shared by
 *   the dispatch of a writer and the start of a check, which differ only in what surrounds it.
 *
 * Exports: launchRun().
 * Depends on: @forge/core (HarnessChangedError, Run), @forge/tools (scrubSecrets, sha256Hex),
 *   domain/results, tick/project-runtime, tick/pump, tick/run-request, tick/settle, tick/tick-config,
 *   shared/trace, types/launch. IO: storage and the driver.
 */

import { HarnessChangedError } from '@forge/core';
import type { Run, RunHandle } from '@forge/core';
import { scrubSecrets, sha256Hex } from '@forge/tools';
import { familyOf, failureResult } from '#/domain/results.js';
import { emitTrace } from '#/shared/trace.js';
import { startPump } from '#/tick/pump.js';
import { buildRunRequest } from '#/tick/run-request.js';
import { settleRun } from '#/tick/settle.js';
import { configVersionRef } from '#/tick/tick-config.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { LaunchInput } from '#/types/launch.types.js';

const msg = (e: unknown): string => String(e instanceof Error ? e.message : e);

/** Starts the run and returns its id and handle, or null when the harness refused it (the run is already settled). */
export async function launchRun(
  ctx: EngineCtx,
  a: LaunchInput,
): Promise<{ runId: string; handle: RunHandle } | null> {
  const { deps, state } = ctx;
  const { ticket, agent, driver, wt, prompt } = a;
  const promptHash = sha256Hex(prompt);
  const runId = deps.ids.runId();
  const token = deps.ids.token();
  const run: Run = {
    id: runId,
    ticket_id: ticket.id,
    project: ticket.project,
    harness: driver.id,
    driver_version: 'unversioned',
    cwd: wt.path,
    lane: ticket.lane,
    started_at: ctx.nowIso,
    status: 'starting',
    owner: deps.owner,
    ...(a.previous ? { retry_of: a.previous.id } : {}),
    prompt_hash: promptHash,
    catalogue_hash: await deps.catalogueHash(driver.id),
    config_version: configVersionRef(ctx.config, ticket.project),
    agent_id: agent.id,
    agent_hash: agent.hash,
  };

  await deps.storage.transaction(async (tx) => {
    await tx.runs.insert(run);
    // The brief is the first event of the run: the thread shows what the Worker was told.
    await tx.runEvents.append(runId, {
      type: 'prompt',
      ts: ctx.nowIso,
      text: scrubSecrets(prompt, []),
    });

    await tx.runTokens.issue(runId, sha256Hex(token), ctx.nowIso);
    if (a.wake) {
      await tx.wakeRequests.markConsumed(a.wake.id, ctx.nowIso);
    }

    await a.inTx?.(tx, runId);
  });

  state.baseShas.set(runId, wt.baseSha);

  const req = buildRunRequest(ctx, {
    runId,
    ticket,
    agent,
    harnessId: a.harness,
    cwd: wt.path,
    prompt,
    promptHash,
    token,
    ...(a.resumeSession ? { resume: a.resumeSession } : {}),
  });

  emitTrace(deps, {
    level: 'info',
    kind: 'run',
    project: ticket.project,
    ticket_id: ticket.id,
    run_id: runId,
    actor: 'engine',
    message: `run start ${runId} for ${ticket.id} on ${driver.id}`,
    // The request carries the run token and env; the trace's redaction pass removes them.
    data: { harness: driver.id, resume: a.resumeSession ?? null, request: req },
  });

  let handle;
  try {
    handle = await driver.start(req);
  } catch (e) {
    deps.log?.('error', `driver.start failed for ${runId}`, { error: msg(e) });
    // A build that changed under the approvals parks the ticket with that reason, not a generic one.
    await settleRun(
      ctx,
      run,
      failureResult(familyOf(e)),
      undefined,
      e instanceof HarnessChangedError
        ? { parkReason: msg(e), parkBuild: { installed: e.installed } }
        : {},
    );

    return null;
  }

  startPump(deps, state, runId, handle, driver);
  await deps.storage.transaction((tx) => tx.runs.update(runId, { status: 'running' }));

  return { runId, handle };
}
