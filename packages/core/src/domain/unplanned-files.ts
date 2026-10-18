/**
 * Unplanned files — the changed files a ticket's plan entry did not say it would touch.
 *
 * Why: "bigger than planned" is the cheapest honest sign that work drifted (d-0135). The plan entry
 *   lists the files the ticket expects to change; the diff says what changed. Which files are
 *   outside the plan is a plain set difference, so the engine computes it itself and never asks the
 *   model, which could be talked out of noticing. A plan path may be a file, a folder (covers
 *   everything under it) or a glob. A plan that lists no files makes no claim about scope, so
 *   nothing is called unplanned then (the Director check still judges the acceptance criteria).
 *
 * Exports: unplannedFiles(), MAX_UNPLANNED.
 * Depends on: shared/glob. No IO.
 */

import { globMatch } from '#/shared/glob.js';

/** The most unplanned paths one report carries. */
export const MAX_UNPLANNED = 200;

const clean = (p: string): string => p.replaceAll('\\', '/').replace(/^\.\//, '');

function covers(planned: string, path: string): boolean {
  const g = clean(planned);
  const p = clean(path);
  if (g === p || globMatch(g, p)) {
    return true;
  }

  // A folder written without a wildcard covers what is under it.
  const dir = g.endsWith('/') ? g : `${g}/`;

  return !/[*?[{]/.test(g) && p.startsWith(dir);
}

/** The paths of `diffPaths` that no entry of `planFiles` covers, sorted, capped. */
export function unplannedFiles(
  planFiles: readonly string[],
  diffPaths: readonly string[],
): string[] {
  if (planFiles.length === 0) {
    return [];
  }

  const out = new Set<string>();
  for (const path of diffPaths) {
    if (!planFiles.some((g) => covers(g, path))) {
      out.add(clean(path));
    }
  }

  return [...out].sort().slice(0, MAX_UNPLANNED);
}
