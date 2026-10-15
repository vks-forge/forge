/**
 * The polling loop for ticket sources that cannot push.
 *
 * Why: some sources (GitHub issues on a machine with no public address) must be asked what
 *   is new. The poller asks each polled adapter on an interval, passing the newest
 *   `received_at` it has seen as the cursor, and hands every event to the engine, whose
 *   dedupe makes overlap and redelivery harmless. A failing source is logged and retried on
 *   the next pass without moving its cursor, so an outage never skips events, and one bad
 *   source never stops another. An event that does not validate or claims another source is
 *   dropped, never ingested. The cursor is in memory: after a restart the first poll asks
 *   from the beginning and dedupe absorbs the repeats (a persisted cursor comes with the
 *   GitHub Issues adapter). With no polled adapter registered, no timer exists at all.
 *
 * Exports: createTriggerPoller(), DEFAULT_POLL_INTERVAL_MS.
 * Depends on: @forge/core (IntakeEvent, TriggerAdapter), types/trigger. IO: timers and the
 *   adapters' own.
 */

import { IntakeEvent } from '@forge/core';
import type { TriggerAdapter } from '@forge/core';
import type { TriggerPoller, TriggerPollerDeps } from '#/types/trigger.types.js';

export const DEFAULT_POLL_INTERVAL_MS = 60_000;

/** Builds the poller; nothing runs until `start()`. */
export function createTriggerPoller(deps: TriggerPollerDeps): TriggerPoller {
  const cursors = new Map<string, string>();
  let timer: NodeJS.Timeout | null = null;
  let inFlight: Promise<void> = Promise.resolve();
  let running = false;

  const pollAdapter = async (adapter: TriggerAdapter): Promise<void> => {
    try {
      const found = (await adapter.poll?.(cursors.get(adapter.id) ?? null)) ?? [];
      let newest = cursors.get(adapter.id) ?? '';

      for (const candidate of found) {
        const parsed = IntakeEvent.safeParse(candidate);
        if (!parsed.success || parsed.data.source !== adapter.source) {
          deps.log('warn', 'polled event dropped: not a valid event of this source', {
            trigger: adapter.id,
          });

          continue;
        }

        await deps.ingest(parsed.data);
        newest = parsed.data.received_at > newest ? parsed.data.received_at : newest;
      }

      if (newest) {
        cursors.set(adapter.id, newest);
      }
    } catch (error) {
      deps.log('error', 'trigger poll failed', {
        trigger: adapter.id,
        error: String(error),
      });
    }
  };

  const pass = async (): Promise<void> => {
    try {
      for (const adapter of deps.registry.polled()) {
        await pollAdapter(adapter);
      }
    } finally {
      running = false;
    }
  };

  const pollOnce = (): Promise<void> => {
    // Single flight: a slow source must not stack passes behind it.
    if (!running) {
      running = true;
      inFlight = pass();
    }

    return inFlight;
  };

  return {
    pollOnce,
    start() {
      if (timer || deps.registry.polled().length === 0) {
        return;
      }

      timer = setInterval(() => void pollOnce(), deps.intervalMs);
    },
    async stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }

      await inFlight;
    },
  };
}
