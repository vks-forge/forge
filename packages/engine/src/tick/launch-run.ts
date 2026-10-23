/**
 * Launches one Worker run: run row, token, request, harness start, pump.
 *
 * Why: the run row and the per-run token (stored only as a hash) are written together before the
 *   harness starts, so a crash after the start leaves a run the restart rule can find and revoke
 *   (d-0054); the brief is stored as the run's first `prompt` event in that same transaction, and
 *   any stage rows the caller needs (the attempt this run carries, the artifacts it was shown) land
 *   there too, so a stage never exists without its run or the other way round. A start that throws
 *   settles the run as a failure and the error family decides retry or park. The run row records the model it
 *   asked for and the entry of its agent's fallback list it runs on, so the strip and the scorecards say what ran. This is shared by
 *   the dispatch of a writer and the start of a check, which differ only in what surrounds it.
 *   The run's clock is the moment it is written and spawned, never the tick's start: a brief or a
 *   worktree can take minutes first, and a `started_at` from before that would let the next stall
 *   scan (silent for `stall_ms`) kill a run that had only just begun. The spawn also stamps
 *   `last_event_at`, which is what the stall scan reads, and the moment is returned so the ticket's
 *   own move is stamped with it.
 *
 * Exports: launchRun().
 * Depends on: @forge/core (HarnessChangedError, HarnessToolsPendingError, Run), @forge/tools (scrubSecrets, sha256Hex),
 *   domain/results, tick/project-runtime, tick/pump, tick/run-agent, tick/run-request, tick/run-permissions, tick/settle, tick/tick-config,
 *   shared/trace, types/launch. IO: storage and the driver.
 */

import { HarnessChangedError, HarnessToolsPendingError } from '@forge/core';
import type { Run, RunHandle } from '@forge/core';
import { scrubSecrets, sha256Hex } from '@forge/tools';
import { familyOf, failureResult } from '#/domain/results.js';
import { iso } from '#/shared/time.js';
import { emitTrace } from '#/shared/trace.js';
import { startPump } from '#/tick/pump.js';
import { modelFor } from '#/tick/run-agent.js';
import { buildRunRequest } from '#/tick/run-request.js';
import { runPermissions } from '#/tick/run-permissions.js';
import { settleRun } from '#/tick/settle.js';
import { configVersionRef } from '#/tick/tick-config.js';
import type { EngineCtx } from '#/types/engine-state.types.js';
import type { LaunchInput } from '#/types/launch.types.js';

/** The model the run asks for and which entry of its agent's chain it runs on (0 own, 1+ fallback, -1 substitute). */
function recorded(ctx: EngineCtx, a: LaunchInput): Pick<Run, 'model' | 'fallback_slot'> {
  const model = modelFor(ctx.config, a.agent, a.ticket.lane, a.harness);

  return { ...(model === undefined ? {} : { model }), fallback_slot: a.agent.slot ?? 0 };
}

const msg = (e: unknown): string => String(e instanceof Error ? e.message : e);

/** Starts the run and returns its id and handle, or null when the harness refused it (the run is already settled). */
export async function launchRun(
  ctx: EngineCtx,
  a: LaunchInput,
): Promise<{ runId: string; handle: RunHandle; at: string } | null> {
  const { deps, state } = ctx;
  const { ticket, agent, driver, wt, prompt } = a;
  const promptHash = sha256Hex(prompt);
  const runId = deps.ids.runId();
  const token = deps.ids.token();
  const startedAt = iso(deps.clock.now());
  const run: Run = {
    id: runId,
    ticket_id: ticket.id,
    project: ticket.project,
    harness: driver.id,
    driver_version: 'unversioned',
    cwd: wt.path,
    lane: ticket.lane,
    started_at: startedAt,
    status: 'starting',
    owner: deps.owner,
    ...(a.previous ? { retry_of: a.previous.id } : {}),
    prompt_hash: promptHash,
    catalogue_hash: await deps.catalogueHash(driver.id),
    config_version: configVersionRef(ctx.config, ticket.project),
    agent_id: agent.id,
    agent_hash: agent.hash,
    ...recorded(ctx, a),
  };

  await deps.storage.transaction(async (tx) => {
    await tx.runs.insert(run);
    // The brief is the first event of the run: the thread shows what the Worker was told.
    await tx.runEvents.append(runId, {
      type: 'prompt',
      ts: startedAt,
      text: scrubSecrets(prompt, []),
    });

    await tx.runTokens.issue(runId, sha256Hex(token), startedAt);
    if (a.wake) {
      await tx.wakeRequests.markConsumed(a.wake.id, startedAt);
    }

    await a.inTx?.(tx, runId);
  });

  state.baseShas.set(runId, wt.baseSha);

  const req = buildRunRequest(ctx, {
    runId,
    ticket,
    agent,
    harnessId: a.harness,
    permissions: await runPermissions(ctx, driver.id),
    cwd: wt.path,
    prompt,
    promptHash,
    token,
    ...(a.resumeSession ? { resume: a.resumeSession } : {}),
    ...(a.pathPrepend ? { pathPrepend: a.pathPrepend } : {}),
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
    // A build that changed under the approvals, or one whose tools still wait for the owner,
    // parks the ticket as a setup problem with that reason, not a generic failure.
    await settleRun(
      ctx,
      run,
      failureResult(familyOf(e)),
      undefined,
      e instanceof HarnessChangedError || e instanceof HarnessToolsPendingError
        ? { parkReason: msg(e), parkBuild: { installed: e.installed } }
        : {},
    );

    return null;
  }

  startPump(deps, state, runId, handle, driver);
  const at = iso(deps.clock.now());
  await deps.storage.transaction((tx) =>
    tx.runs.update(runId, { status: 'running', last_event_at: at }),
  );

  return { runId, handle, at };
}
