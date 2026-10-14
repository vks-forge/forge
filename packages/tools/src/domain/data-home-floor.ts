/**
 * Data-home floor — Workers never touch Forge's own data folder, except their own worktree.
 *
 * Why: the data home holds the database, the encrypted secrets, every run's hook config and
 *   token, and every other ticket's worktree (d-0098). A Worker that could read these could
 *   forge receipts or speak as another run; one that could write them could rewrite policy.
 *   Worker worktrees live inside that folder, so a relative-name glob cannot separate
 *   the run's own tree from the rest. The floor therefore works on absolute paths:
 *   anything under the data home that is not inside the run's worktree is denied for every
 *   path tool and every path a shell command names. The data home arrives as plain data
 *   (this package never reads the environment); an unknown or relative data home denies
 *   every path, because a floor that cannot say where it is must not guess.
 *
 * Exports: dataHomeKnown(), dataHomeGuard(), dataHomeOutcome(), DATA_HOME_RULE, DATA_HOME_UNKNOWN_RULE.
 * Depends on: shared/path, types/rules. No IO.
 */

import { absolutePath, isInside } from '#/shared/path.js';
import type { RuleOutcome } from '#/types/rules.types.js';

/** Rule id reported when a path lies in the data home outside the run's worktree. */
export const DATA_HOME_RULE = 'floor:data-home';
/** Rule id reported when the data home is empty or not absolute. */
export const DATA_HOME_UNKNOWN_RULE = 'floor:data-home:unknown';

/** Drive-with-separator, UNC or root; `C:forge` (drive-relative) and `~` are not absolute. */
const ABSOLUTE = /^(?:[a-zA-Z]:[\\/]|[\\/])/;

/** True when `dataHome` is a usable absolute path (drive, UNC or root). */
export function dataHomeKnown(dataHome: string): boolean {
  return ABSOLUTE.test(dataHome);
}

/** The rule id that denies everything when `dataHome` is unusable, else `null`. */
export function dataHomeGuard(dataHome: string): string | null {
  return dataHomeKnown(dataHome) ? null : DATA_HOME_UNKNOWN_RULE;
}

/**
 * A deny outcome when `resource` (resolved against `cwd`, the run's worktree) is inside
 * `dataHome` but not inside `cwd`, or when `dataHome` is unusable; `null` when the floor has
 * nothing to say.
 */
export function dataHomeOutcome(
  dataHome: string,
  resource: string,
  cwd: string | undefined,
): RuleOutcome | null {
  if (!dataHomeKnown(dataHome)) {
    return { effect: 'deny', reason: 'managed_deny', rule: DATA_HOME_UNKNOWN_RULE };
  }

  const abs = absolutePath(resource, cwd);
  const inHome = isInside(abs, dataHome);
  const inOwnTree = cwd !== undefined && isInside(abs, cwd);
  if (inHome && !inOwnTree) {
    return { effect: 'deny', reason: 'managed_deny', rule: DATA_HOME_RULE };
  }

  return null;
}
