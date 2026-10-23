/**
 * Hard floor — the one list of rules that bypass mode can never lift.
 *
 * Why: with "Bypass permissions" on (d-0183) a Worker is never stopped to ask the owner, so
 *   every `ask` becomes `allow`. A few consequences must still be gated by Forge's own hook,
 *   outside the agent's control: reading secrets or Forge's own data folder, touching paths
 *   outside the ticket's worktree, pushing or publishing, destructive deletes, and rewriting
 *   the policy files that define these limits. Those rules already deny on their own; this
 *   list names them in one place so the bypass step can tell a floor rule from an ordinary
 *   lane `ask`, and so a floor rule that ever turns up as an `ask` is refused, never allowed.
 *   Workers still run as the owner's account, so this is a Forge rule, not an OS boundary.
 *
 * Exports: HARD_FLOOR, isHardFloorRule().
 * Depends on: domain/data-home-floor, types/hard-floor. No IO.
 */

import { DATA_HOME_RULE, DATA_HOME_UNKNOWN_RULE } from '#/domain/data-home-floor.js';
import type { HardFloorArea } from '#/types/hard-floor.types.js';

/**
 * Rule ids, grouped by what they protect. `managed#` covers the built-in floor rules
 * (`FLOOR_RULES`: credential files, outside-worktree paths, `git push`, publishers,
 * `rm -rf /`, harness config, `.git`) and any operator deny rule, which are all deny-only.
 */
export const HARD_FLOOR: readonly { id: string; prefix: boolean; area: HardFloorArea }[] =
  [
    { id: DATA_HOME_RULE, prefix: false, area: 'data-home' },
    { id: DATA_HOME_UNKNOWN_RULE, prefix: false, area: 'data-home' },
    { id: 'floor:argv:env-read', prefix: false, area: 'secrets' },
    { id: 'floor:argv:wildcard-path', prefix: false, area: 'secrets' },
    { id: 'floor:argv:git-outside-worktree', prefix: false, area: 'outside-worktree' },
    { id: 'floor:argv:git-push', prefix: false, area: 'publish' },
    { id: 'floor:argv:gh-release', prefix: false, area: 'publish' },
    { id: 'floor:argv:publish', prefix: false, area: 'publish' },
    { id: 'floor:argv:recursive-delete', prefix: false, area: 'destructive' },
    { id: 'floor:argv:git-config', prefix: false, area: 'policy' },
    { id: 'floor:argv:eval-text', prefix: false, area: 'destructive' },
    { id: 'floor:argv:nesting', prefix: false, area: 'destructive' },
    { id: 'managed#', prefix: true, area: 'secrets' },
    // Any future `floor:` rule is a floor too: unknown floors fail closed.
    { id: 'floor:', prefix: true, area: 'policy' },
  ];

/** True when `rule` (a decision's `matched_rule`) belongs to the hard floor. */
export function isHardFloorRule(rule: string | null): boolean {
  if (rule === null) {
    return false;
  }

  return HARD_FLOOR.some((f) => (f.prefix ? rule.startsWith(f.id) : rule === f.id));
}
