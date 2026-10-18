/**
 * Connected model families: which vendors' models the installed harnesses can run.
 *
 * Why: a critic on the same model family as the Worker tends to approve its work (d-0073). That is
 *   only a warning while one family is connected and a refusal once a second exists, so the pipeline
 *   save door needs to know how many families the harnesses declare. Each driver lists the models it
 *   can run; this maps every listed model to its vendor family with core's `modelFamilyOf` and answers
 *   the distinct set. A driver that cannot list its models counts as none (never as a new family), so a
 *   failing probe can only make the rule laxer, never refuse a save on a guess.
 *
 * Exports: connectedFamilies().
 * Depends on: @forge/core (modelFamilyOf, DriverRegistry), types/agent-store. IO: asks the drivers for their models.
 */

import { modelFamilyOf } from '@forge/core';
import type { AgentDeps } from '#/types/agent-store.types.js';

/** The distinct model families the installed harnesses declare, sorted. */
export async function connectedFamilies(
  deps: Pick<AgentDeps, 'ports'>,
): Promise<string[]> {
  const registry = deps.ports?.drivers;
  const families = new Set<string>();
  for (const id of registry?.ids() ?? []) {
    try {
      for (const m of (await registry?.get(id)?.models()) ?? []) {
        families.add(modelFamilyOf({ kind: 'model', id: m.id }));
      }
    } catch {
      // A driver that cannot list its models adds no family.
    }
  }

  return [...families].sort();
}
