/**
 * The registry of ticket sources: which trigger adapters this server accepts events from.
 *
 * Why: the intake door must accept events only from sources someone deliberately turned on.
 *   Without a registry, any client could post `source: "webhook"` or `"github_issue"` and
 *   have it treated as that source. Holding adapters here (composition, not the engine) keeps
 *   the engine ignorant of sources and lets the app decide per install which are enabled.
 *   Registration fails loudly on a duplicate or on an adapter that claims to poll but cannot,
 *   so a misconfiguration stops the server at start, not at the first missed event.
 *
 * Exports: createTriggerRegistry().
 * Depends on: @forge/core (InvalidInputError, TriggerAdapter), types/trigger. No IO.
 */

import { InvalidInputError } from '@forge/core';
import type { TriggerAdapter } from '@forge/core';
import type { TriggerRegistry } from '#/types/trigger.types.js';

/** A registry holding `initial` adapters; more can be registered before the server starts. */
export function createTriggerRegistry(
  initial: readonly TriggerAdapter[] = [],
): TriggerRegistry {
  const byId = new Map<string, TriggerAdapter>();
  const bySource = new Map<string, TriggerAdapter>();

  const registry: TriggerRegistry = {
    register(adapter) {
      if (byId.has(adapter.id)) {
        throw new InvalidInputError(`trigger "${adapter.id}" is already registered`);
      }

      const owner = bySource.get(adapter.source);
      if (owner) {
        throw new InvalidInputError(
          `source "${adapter.source}" already belongs to trigger "${owner.id}"`,
        );
      }

      const { push, poll } = adapter.capabilities();
      if (!push && !poll) {
        throw new InvalidInputError(`trigger "${adapter.id}" can neither push nor poll`);
      }

      if (poll && !adapter.poll) {
        throw new InvalidInputError(
          `trigger "${adapter.id}" declares poll but has no poll()`,
        );
      }

      byId.set(adapter.id, adapter);
      bySource.set(adapter.source, adapter);
    },
    forSource: (source) => bySource.get(source),
    list: () => [...byId.values()],
    polled: () => [...byId.values()].filter((a) => a.capabilities().poll),
  };

  initial.forEach((adapter) => registry.register(adapter));

  return registry;
}
