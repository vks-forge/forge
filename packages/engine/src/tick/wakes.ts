/**
 * Wake requests: idempotent "look at this ticket again" with the re-wake cap.
 *
 * Why: retries, answers and timers all end as a wake row the next tick acts on. Wakes are
 *   idempotent on (ticket, reason, key) so a redelivered event or a double click queues one
 *   wake, not two runs. Recovery wakes (retries after a failure) are capped per ticket per
 *   hour: without the cap a flapping ticket re-wakes forever, burning budget (the
 *   Paperclip failure mode, director-core.md §3). A refused wake tells the caller to park
 *   the ticket for a human instead.
 *
 * Exports: requestWake(), requestWakeTx().
 * Depends on: @forge/core (WakeRequest ports), types/tick, shared/time. No IO of its own.
 */

import type { StorageTx } from '@forge/core';
import { iso } from '#/shared/time.js';
import type { EngineDeps } from '#/types/engine.types.js';
import type { WakeInput, WakeOutcome } from '#/types/tick.types.js';

/** Queues a wake inside an open transaction. Retry wakes past the hourly cap are refused. */
export async function requestWakeTx(
  tx: StorageTx,
  deps: EngineDeps,
  input: WakeInput,
): Promise<WakeOutcome> {
  const now = deps.clock.now();
  if (input.kind === 'retry') {
    const { max, window_ms } = deps.config.engine.rewake_cap;
    const recent = await tx.wakeRequests.countSince(
      input.ticketId,
      iso(now - window_ms),
      ['retry'],
    );

    if (recent >= max) {
      return { created: false, capped: true };
    }
  }

  const { inserted, request } = await tx.wakeRequests.insertIfNew({
    id: deps.ids.wakeId(),
    ticket_id: input.ticketId,
    reason: input.reason,
    kind: input.kind,
    idempotency_key: input.key,
    created_at: iso(now),
    ...(input.notBefore === undefined ? {} : { not_before: iso(input.notBefore) }),
  });

  return { created: inserted, capped: false, wake: request };
}

/** {@link requestWakeTx} in its own transaction. */
export function requestWake(deps: EngineDeps, input: WakeInput): Promise<WakeOutcome> {
  return deps.storage.transaction((tx) => requestWakeTx(tx, deps, input));
}
