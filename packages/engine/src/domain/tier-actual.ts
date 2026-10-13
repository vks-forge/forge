/**
 * Actual tier of a finished ticket: what the diff touched, never less than predicted.
 *
 * Why: the tier decides who may merge. Triage guesses it from the request, but only the
 *   real diff shows whether the Worker reached into a path the project reserves for tier C
 *   (auth, billing, migrations). If the prediction alone decided, a harmless-looking ticket
 *   that edited `auth/` could auto-merge at tier A. The result is never below the
 *   prediction, so a verify cycle can only raise the bar a human set.
 *
 * Exports: computeTierActual().
 * Depends on: @forge/core (globMatch, Tier). No IO.
 */

import { globMatch } from '@forge/core';
import type { Tier } from '@forge/core';

/** C when any changed path matches a tier-C glob of the project, else the predicted tier. */
export function computeTierActual(
  predicted: Tier,
  tierCGlobs: readonly string[],
  changedPaths: readonly string[],
): Tier {
  const touchesC = changedPaths.some((p) => tierCGlobs.some((g) => globMatch(g, p)));

  return touchesC ? 'C' : predicted;
}
