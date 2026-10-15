/**
 * Composes the ticket sources and their polling loop for one server.
 *
 * Why: the assembly is already long; what turns on which sources (chat always, the rest
 *   from the external ports) and how polled ones reach the engine is one decision, kept here
 *   so the assembly only asks for "the triggers".
 *
 * Exports: composeTriggers().
 * Depends on: @forge/core (IntakeEvent, TriggerAdapter), @forge/engine (Logger),
 *   @forge/triggers (createChatTrigger), services/trigger-poller, services/trigger-registry.
 */

import type { IntakeEvent, TriggerAdapter } from '@forge/core';
import type { Logger } from '@forge/engine';
import { createChatTrigger } from '@forge/triggers';
import {
  DEFAULT_POLL_INTERVAL_MS,
  createTriggerPoller,
} from '#/services/trigger-poller.js';
import { createTriggerRegistry } from '#/services/trigger-registry.js';
import type { TriggerPoller, TriggerRegistry } from '#/types/trigger.types.js';

/** Chat is always on (d-0002); `extra` adapters are registered beside it. */
export function composeTriggers(opts: {
  extra: readonly TriggerAdapter[] | undefined;
  ingest: (event: IntakeEvent) => Promise<unknown>;
  pollMs: number | undefined;
  log: Logger;
}): { registry: TriggerRegistry; poller: TriggerPoller } {
  const registry = createTriggerRegistry([createChatTrigger(), ...(opts.extra ?? [])]);
  const poller = createTriggerPoller({
    registry,
    ingest: opts.ingest,
    intervalMs: opts.pollMs ?? DEFAULT_POLL_INTERVAL_MS,
    log: opts.log,
  });

  return { registry, poller };
}
