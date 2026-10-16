/**
 * The project events hub: a synchronous in-process fan-out of "these queries are stale".
 *
 * Why: board, card and inbox views must update within a second of a write instead of waiting
 *   for a poll (d-0132). One small emitter keyed by project slug is all that takes: writers
 *   call `invalidate` after a commit, each open stream subscribed to that project gets the
 *   keys and writes one SSE frame. Nothing is stored or replayed (a reconnecting client
 *   refetches everything), so a listener that throws or a closed stream cannot affect the
 *   writer, and the hub holds no state beyond the live listeners.
 *
 * Exports: createProjectEvents().
 * Depends on: @forge/core (QueryKey), types/project-events. No IO.
 */

import type { QueryKey } from '@forge/core';
import type {
  ProjectEventListener,
  ProjectEvents,
} from '#/types/project-events.types.js';

/** Builds an empty hub. */
export function createProjectEvents(): ProjectEvents {
  const listeners = new Map<string, Set<ProjectEventListener>>();

  return {
    invalidate(project, keys) {
      const unique = [
        ...new Map(keys.map((k): [string, QueryKey] => [JSON.stringify(k), k])).values(),
      ];

      if (unique.length === 0) {
        return;
      }

      for (const listener of [...(listeners.get(project) ?? [])]) {
        try {
          listener(unique);
        } catch {
          // A broken stream must never fail the write that triggered it.
        }
      }
    },

    subscribe(slug, listener) {
      const set = listeners.get(slug) ?? new Set<ProjectEventListener>();
      set.add(listener);
      listeners.set(slug, set);

      return () => {
        set.delete(listener);
        if (set.size === 0 && listeners.get(slug) === set) {
          listeners.delete(slug);
        }
      };
    },
  };
}
