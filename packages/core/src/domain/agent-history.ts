/**
 * Agent history — one agent's changes, read off its scope's version history.
 *
 * Why: the owner asks "who changed the reviewer, when and why" and the answer already exists:
 *   every agent save is a version of the company or project document, with author and reason.
 *   Storing a second per-agent log would let the two disagree, so the history is derived: walk
 *   the versions in order, compare what each says about this one agent with what the previous
 *   version said, and keep the versions where it changed, with what kind of change it was.
 *
 * Exports: agentHistory().
 * Depends on: schemas/agent-api, schemas/config-override, shared/stable-json, types/agent-history. No IO.
 */

import type { AgentHistoryEntry } from '#/schemas/agent-api.js';
import type { ConfigVersion } from '#/schemas/config-override.js';
import { stableJson } from '#/shared/stable-json.js';
import type { AgentChange } from '#/schemas/agent-api.js';
import type { AgentStanding } from '#/types/agent-history.types.js';

function standing(v: ConfigVersion, id: string): AgentStanding {
  if (v.scope === 'company') {
    return { stored: v.doc.agents?.[id], disabled: false };
  }

  const a = v.doc.agents;

  return {
    stored: a?.custom?.[id] ?? a?.overrides?.[id],
    disabled: (a?.disabled ?? []).includes(id),
  };
}

const archivedOf = (stored: unknown): boolean =>
  typeof stored === 'object' &&
  stored !== null &&
  (stored as { archived?: unknown }).archived === true;

function classify(before: AgentStanding, after: AgentStanding): AgentChange | null {
  if (before.disabled !== after.disabled) {
    return after.disabled ? 'disabled' : 'enabled';
  }

  const was = stableJson(before.stored);
  const now = stableJson(after.stored);
  if (was === now) {
    return null;
  }

  if (after.stored === undefined) {
    return 'reset';
  }

  if (before.stored === undefined) {
    // A built-in has no key until it is edited; only a custom agent is "created" by its first version.
    return typeof after.stored === 'object' &&
      after.stored !== null &&
      (after.stored as { origin?: unknown }).origin !== undefined &&
      (after.stored as { origin?: unknown }).origin !== 'builtin'
      ? 'created'
      : 'edited';
  }

  if (archivedOf(before.stored) !== archivedOf(after.stored)) {
    return archivedOf(after.stored) ? 'archived' : 'unarchived';
  }

  return 'edited';
}

/** The versions (oldest first) in which agent `id` changed, each with its kind of change. */
export function agentHistory(
  versions: readonly ConfigVersion[],
  id: string,
): AgentHistoryEntry[] {
  const out: AgentHistoryEntry[] = [];
  let before: AgentStanding = { stored: undefined, disabled: false };

  for (const v of versions) {
    const after = standing(v, id);
    const change = classify(before, after);

    if (change !== null) {
      out.push({
        version: v.version,
        author: v.author,
        reason: v.reason,
        created_at: v.created_at,
        change,
      });
    }

    before = after;
  }

  return out;
}
