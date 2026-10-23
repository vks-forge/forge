/**
 * Provenance-only failure — recognising a G1 verdict whose only problem is a lost earlier-run proof.
 *
 * Why: a Worker run that errored or paused leaves edits in the ticket's branch that a later run
 *   cannot claim, and G1 vouches for them only through the earlier run's receipt chain. When
 *   that chain's run secret is gone (a ticket from before secrets were kept to ticket close, a
 *   wiped secret store), no later run can bring the proof back; the Worker can only re-apply the
 *   files through its own tools, which an ordinary rework asks it to do. If that does not work
 *   (the reworks are spent), the owner, who does not write code, must not meet a dead-end card:
 *   they look at the shown diff and vouch for it. This pure rule says when a failed G1 is that and
 *   nothing else, so the engine can hold the ticket for the owner as a `provenance_hold`. Fail
 *   closed: any unknown, any other failing check, any finding with no file (an unsupported claim)
 *   or any check that errored means the ordinary road (F-D3, same rule as config holds, d-0173).
 *
 * Exports: PROVENANCE_CHECK, provenanceOnlyFiles(), provenanceHoldSummary().
 * Depends on: types/ports/gate. No IO.
 */

import type { GateVerdict } from '#/types/ports/gate.types.js';

/** The check name G1's claim matcher puts on its findings. */
export const PROVENANCE_CHECK = 'claims';

/**
 * The files whose earlier-run proof is gone when `verdicts` (one per failed gate) fail on that
 * alone; null when there is nothing to say that about or anything else is wrong.
 */
export function provenanceOnlyFiles(
  verdicts: readonly (GateVerdict | undefined)[],
): string[] | null {
  if (verdicts.length === 0) {
    return null;
  }

  const files = new Set<string>();
  for (const v of verdicts) {
    if (
      v === undefined ||
      v.status !== 'failed' ||
      v.provenanceOnly !== true ||
      v.findings.length === 0 ||
      v.findings.some((f) => f.check !== PROVENANCE_CHECK || f.file === undefined)
    ) {
      return null;
    }

    for (const f of v.findings) {
      files.add(f.file ?? '');
    }
  }

  return [...files];
}

/** The card text of a provenance hold: the files, and what the owner can do about them. */
export function provenanceHoldSummary(files: readonly string[]): string {
  const shown = files.slice(0, 10).join(', ');
  const more = files.length > 10 ? ` and ${files.length - 10} more` : '';

  return `Forge cannot prove who changed ${shown}${more}: the record of the earlier run that edited them is gone. Check the changes, then Merge anyway or send it back.`;
}
