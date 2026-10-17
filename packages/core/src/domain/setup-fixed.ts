/**
 * `isSetupFixed` — has the owner fixed what a setup escalation asked for?
 *
 * Why: a setup escalation (sign in, approve a tool, review a new harness build) ends when the
 *   cause is gone, either by itself on the next tick or when the owner presses "I fixed it".
 *   Answering from a stale fact would send the Worker straight back into the same denial;
 *   refusing to answer would make the owner click forever. The check reads only facts Forge
 *   already stores (the harness row, the tool-schema row, the catalogue, the project grant, the
 *   build's compatibility row), so it is cheap enough to run each tick and never probes the
 *   harness. It only decides whether to try again: the next run still passes `admit()`.
 *
 * Exports: isSetupFixed().
 * Depends on: schemas/escalation, types/escalation. No IO.
 */

import type { SetupCause } from '#/schemas/escalation.js';
import type { SetupFacts } from '#/types/escalation.types.js';

const SCHEMA_REASONS: readonly string[] = [
  'schema_pending',
  'schema_changed',
  'schema_denied',
];

const CATALOGUE_REASONS: readonly string[] = ['unknown_tool', 'quarantined'];
const GRANT_REASONS: readonly string[] = ['not_granted', 'unattended'];

/**
 * Whether `facts` show the cause fixed. `since` is when the escalation was raised: a login only
 * counts as fixed by a harness test that ran after it, so an old "ok" proves nothing.
 */
export function isSetupFixed(
  cause: SetupCause,
  facts: SetupFacts,
  since: string,
): boolean {
  switch (cause.type) {
    case 'login': {
      const h = facts.harness;

      return (
        h?.status === 'ok' && h.last_checked_at !== undefined && h.last_checked_at > since
      );
    }

    case 'tool':
      if (SCHEMA_REASONS.includes(cause.reason_code)) {
        return facts.toolSchema?.status === 'approved';
      }

      if (CATALOGUE_REASONS.includes(cause.reason_code)) {
        return facts.catalogued === true;
      }

      return GRANT_REASONS.includes(cause.reason_code) && facts.granted === true;
    case 'harness_build':
      return facts.build?.compat === 'pass';
  }
}
