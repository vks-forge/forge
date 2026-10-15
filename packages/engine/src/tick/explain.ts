/**
 * Explain: why a ticket has not started, in one line, from the scheduler's own decision.
 *
 * Why: a ticket that sits in Planned looks stuck unless the page says what it waits for: a
 *   blocker that is not done, a harness parked until its quota resets, or a limit on how many
 *   Workers may run. The answer is computed by running the same scheduling decision dispatch
 *   runs, read-only, so what the page says can never differ from what the next tick does.
 *   A ticket that is already running, finished, or about to be started has nothing to
 *   explain and gets null. A ticket whose only reason is a wake set for later (the backoff
 *   after a failure, or the reset of a parked harness) is explained from that wake.
 *
 * Exports: explainWait().
 * Depends on: @forge/core, domain/wait-reason, shared/time, tick/schedule, tick/tick-config,
 *   tick/quota. IO: reads storage and settings; writes nothing.
 */

import { TERMINAL_STATUSES } from '@forge/core';
import type { TicketId } from '@forge/core';
import { clockUtc, describeWait } from '#/domain/wait-reason.js';
import { FAR_FUTURE, iso } from '#/shared/time.js';
import { QUOTA_WAIT } from '#/tick/quota.js';
import { pickFrom, planDispatch } from '#/tick/schedule.js';
import { loadTickConfig } from '#/tick/tick-config.js';
import type { EngineState } from '#/types/engine-state.types.js';
import type { EngineDeps } from '#/types/engine.types.js';

/** The wait reason line for `ticketId` (`quota: claude-code until 14:20 UTC`, `cap: per-project 1/1`, `deps: PAY-231`), or null when it is not waiting on the scheduler. */
export async function explainWait(
  deps: EngineDeps,
  state: EngineState,
  ticketId: string,
): Promise<string | null> {
  const config = await loadTickConfig(deps);
  const now = deps.clock.now();
  const view = { deps, state, config, now, nowIso: iso(now) };

  return deps.storage.transaction(async (tx) => {
    const plan = await planDispatch(view, tx, false);
    const result = pickFrom(plan, now, state.schedulerCursor);
    const wait = result.waits.get(ticketId);
    if (wait) {
      return describeWait(wait);
    }

    if (result.picked.some((p) => p.id === ticketId)) {
      return null;
    }

    const ticket = await tx.tickets.get(ticketId as TicketId);
    if (!ticket || TERMINAL_STATUSES.includes(ticket.status)) {
      return null;
    }

    const later = (await tx.wakeRequests.listDue(FAR_FUTURE)).find(
      (w) =>
        w.ticket_id === ticketId &&
        w.not_before !== undefined &&
        Date.parse(w.not_before) > now,
    );

    if (!later?.not_before) {
      return null;
    }

    const until = Date.parse(later.not_before);
    const harness = (await tx.runs.listByTicket(ticketId)).at(-1)?.harness;
    const paused = harness === undefined ? undefined : plan.caps.paused[harness];
    if (later.reason === QUOTA_WAIT && harness !== undefined && paused) {
      return `quota: ${harness} until ${clockUtc(paused.until)}`;
    }

    return `retry: backing off until ${clockUtc(until)}`;
  });
}
