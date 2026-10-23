/**
 * Conflict markers left in a ticket's files — recognising them on a failed gate verdict.
 *
 * Why: when main moves under a ticket, Forge merges it in and may commit the clash with git's
 *   `<<<<<<<` markers inside the files, so the ticket's writer can resolve it. A writer that stops
 *   early leaves markers behind and G1 refuses them. That failure is the same clash, not a broken
 *   check: sending it back through the ordinary rework road would spend the gate-failure budget
 *   and tell the Worker its work was "rejected by the gates". The engine reads the failed verdicts
 *   through this rule and routes a marker failure back to the writer as a conflict instead.
 *
 * Exports: CONFLICT_MARKER_CHECK, conflictMarkerFiles().
 * Depends on: types/ports/gate. No IO.
 */

import type { GateVerdict } from '#/types/ports/gate.types.js';

/** The check name G1's conflict-marker check puts on its findings. */
export const CONFLICT_MARKER_CHECK = 'conflict-markers';

/** The files that still hold conflict markers according to `verdicts` (one per failed gate); null when none does. */
export function conflictMarkerFiles(
  verdicts: readonly (GateVerdict | undefined)[],
): string[] | null {
  const files = new Set<string>();
  for (const v of verdicts) {
    for (const f of v?.findings ?? []) {
      if (f.check === CONFLICT_MARKER_CHECK && f.file !== undefined) {
        files.add(f.file);
      }
    }
  }

  return files.size === 0 ? null : [...files];
}
