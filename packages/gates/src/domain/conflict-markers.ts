/**
 * Conflict-marker check — unresolved merge markers never reach main.
 *
 * Why: when main moves under a ticket, Forge merges it in and, on a clash, commits the files with
 *   git's `<<<<<<<` / `>>>>>>>` markers so the ticket's writer can resolve it. A writer that stops
 *   early would leave them in the tree, and a test that never reads that file still passes. G1
 *   refuses any line the ticket adds that starts a marker, in any text file of any language (the
 *   check reads the diff, not the ecosystem). Lines already in the base are not in the diff and
 *   removed ones are ignored, so cleaning markers up passes. A bare `=======` is common in
 *   documents, so only the two outer markers count. The finding names the file; the engine reads it
 *   to send the ticket back to its writer as a conflict, not a failed gate (core conflict-markers).
 *
 * Exports: checkConflictMarkers().
 * Depends on: @forge/core (CONFLICT_MARKER_CHECK), types/check. No IO.
 */

import { CONFLICT_MARKER_CHECK } from '@forge/core';
import type { GateFinding } from '@forge/core';
import type { CheckOutcome, PatchFile } from '#/types/check.types.js';

const MARKER = /^(<<<<<<<|>>>>>>>) /;

/** Fails on any added line that opens or closes a merge-conflict block; one finding per file. */
export function checkConflictMarkers(patch: readonly PatchFile[]): CheckOutcome {
  const findings: GateFinding[] = [];
  for (const file of patch) {
    if (
      file.binary ||
      file.unparsed === true ||
      !file.added.some((l) => MARKER.test(l))
    ) {
      continue;
    }

    findings.push({
      check: CONFLICT_MARKER_CHECK,
      file: file.path,
      message: `${file.path}: unresolved merge-conflict markers (<<<<<<< or >>>>>>> lines); combine both sides and remove every marker`,
    });
  }

  return {
    name: CONFLICT_MARKER_CHECK,
    status: findings.length === 0 ? 'passed' : 'failed',
    findings,
    details:
      findings.length === 0
        ? 'No merge-conflict markers were added.'
        : findings.map((f) => `- ${f.message}`).join('\n'),
  };
}
