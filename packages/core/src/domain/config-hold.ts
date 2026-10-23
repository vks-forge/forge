/**
 * Config-only failure — recognising a G1 verdict whose only problem is gate configuration.
 *
 * Why: the owner of a Forge project does not write code. When a Worker creates `tsconfig.json`
 *   or `vitest.config.ts` because its ticket needs them, G1's gate-config guard flags the files,
 *   but a rework cannot change that: the next Worker would have to delete files the ticket
 *   requires, so the automatic reworks only burn runs and end in a dead-end card (d-0173). The
 *   one fix is a person looking at those files. This pure rule says when a failed G1 is that and
 *   nothing else, so the engine parks the ticket for the owner (Merge anyway, Send back, Re-plan,
 *   Cancel) instead of reworking. Fail closed: any unknown, any other failing check or any check
 *   that errored means the ordinary road (rework, then the rework cap).
 *
 * Exports: GATE_CONFIG_CHECK, configOnlyFiles(), configHoldSummary().
 * Depends on: types/ports/gate. No IO.
 */

import type { GateVerdict } from '#/types/ports/gate.types.js';

/** The check name the gate-config guard puts on its findings. */
export const GATE_CONFIG_CHECK = 'gate-config';

/**
 * The files the Worker changed when `verdicts` (one per failed gate) fail on gate configuration
 * alone; null when there is nothing to say that about or anything else is wrong. A finding with no
 * file (a guarded script in `package.json`) names `package.json`.
 */
export function configOnlyFiles(
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
      v.configOnly !== true ||
      v.findings.length === 0 ||
      v.findings.some((f) => f.check !== GATE_CONFIG_CHECK)
    ) {
      return null;
    }

    for (const f of v.findings) {
      files.add(f.file ?? 'package.json');
    }
  }

  return [...files];
}

/** The card text of a config hold: the files, and what the owner can do about them. */
export function configHoldSummary(files: readonly string[]): string {
  const shown = files.slice(0, 10).join(', ');
  const more = files.length > 10 ? ` and ${files.length - 10} more` : '';

  return `The Worker changed files that control how its work is checked (${shown}${more}); review them, then Merge anyway or send it back.`;
}
