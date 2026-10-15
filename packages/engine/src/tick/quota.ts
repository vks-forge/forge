/**
 * Quota: what a run that ended out of quota means for its harness and its ticket.
 *
 * Why: the harness runs on the user's own subscription, and when its usage window is used up
 *   every other run on it would fail the same way, spend its retries and park for a human.
 *   The right response is to stop starting work on that harness until the reset time the
 *   harness named (an hour from now when it named none), tell the owner why in plain words,
 *   and let the ticket wait with a wake at that time, as an ordinary delay and not a recovery
 *   attempt. If the project lists another installed harness as an acceptable fallback
 *   (d-0080) the ticket's wake is due at once, and dispatch will route it there while the
 *   first harness stays parked (d-0097).
 *
 * Exports: QUOTA_WAIT, parkHarnessForQuota(), requestQuotaWake().
 * Depends on: @forge/core (HarnessId, RunResult), domain/harness-choice, domain/wait-reason,
 *   shared/time, tick/wakes, tick/tick-config. Writes inside the caller's transaction.
 */

import { HarnessId } from '@forge/core';
import type { Run, RunResult, StorageTx, Ticket } from '@forge/core';
import { chooseHarness } from '#/domain/harness-choice.js';
import { clockUtc } from '#/domain/wait-reason.js';
import { iso } from '#/shared/time.js';
import { projectSettings } from '#/tick/tick-config.js';
import { requestWakeTx } from '#/tick/wakes.js';
import type { EngineCtx } from '#/types/engine-state.types.js';

/** The wake reason of a ticket waiting for its harness's quota to reset. */
export const QUOTA_WAIT = 'quota_wait';

/** When the harness may be used again (epoch ms): the reset it named if still ahead, else the default wait. */
function resumeAt(ctx: EngineCtx, result: RunResult): number {
  const named =
    result.retryNotBefore === undefined ? NaN : Date.parse(result.retryNotBefore);

  return named > ctx.now
    ? named
    : ctx.now + ctx.config.forge.engine.quota_default_pause_ms;
}

/**
 * Parks `run.harness` until its reset and returns the time (epoch ms). A pause already
 * further out is kept, so two runs ending in one tick cannot shorten it. A harness id the
 * pause table cannot hold (not a slug) is left unparked; the ticket's own wake still waits.
 */
export async function parkHarnessForQuota(
  ctx: EngineCtx,
  tx: StorageTx,
  run: Run,
  result: RunResult,
): Promise<number> {
  const until = resumeAt(ctx, result);
  const named =
    result.retryNotBefore !== undefined && Date.parse(result.retryNotBefore) > ctx.now;

  if (!HarnessId.safeParse(run.harness).success) {
    ctx.deps.log?.('warn', `harness id ${run.harness} cannot be parked for quota`);

    return until;
  }

  const existing = await tx.harnessState.get(run.harness);
  const kept = existing ? Date.parse(existing.paused_until) : 0;
  if (kept >= until) {
    return kept;
  }

  await tx.harnessState.upsert({
    harness_id: run.harness,
    paused_until: iso(until),
    reason: named
      ? `Out of quota; resets at ${clockUtc(until)}.`
      : `Out of quota; no reset time given, trying again at ${clockUtc(until)}.`,
    updated_at: ctx.nowIso,
  });

  ctx.deps.log?.('warn', `harness ${run.harness} parked until ${iso(until)} (quota)`);

  return until;
}

/**
 * Queues the ticket's `quota_wait` wake: at the reset, or now when a configured fallback
 * harness can take the ticket meanwhile. Not counted against the hourly re-wake cap.
 */
export async function requestQuotaWake(
  ctx: EngineCtx,
  tx: StorageTx,
  ticket: Ticket,
  run: Run,
  until: number,
): Promise<void> {
  const project = await tx.projects.get(ticket.project);
  const settings = projectSettings(ctx.config, project?.slug ?? ticket.project);
  const fallbacks =
    settings.harness_fallbacks ?? ctx.config.forge.engine.harness_fallbacks;

  const elsewhere =
    chooseHarness(
      run.harness,
      fallbacks,
      { [run.harness]: { until, reason: 'quota' } },
      (id) => ctx.deps.drivers.get(id) !== null,
      ctx.now,
    ) !== run.harness;

  await requestWakeTx(tx, ctx.deps, {
    ticketId: ticket.id,
    kind: 'retry',
    reason: QUOTA_WAIT,
    key: run.id,
    uncapped: true,
    ...(elsewhere ? {} : { notBefore: until }),
  });
}
