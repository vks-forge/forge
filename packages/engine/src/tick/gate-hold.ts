/**
 * Gate hold: the owner card a G1 failure that only the owner can settle becomes.
 *
 * Why: some G1 failures no rework can fix and the owner, who does not write code, must not
 *   reach as a dead-end card. Two are known. The Worker created `tsconfig.json` or
 *   `vitest.config.ts` because its ticket asked for it and G1's gate-config guard flags it
 *   (`config_hold`, d-0173). Or an earlier run edited files and its proof (run secret) is gone,
 *   so G1 cannot say who changed them (`provenance_hold`, F-D3). This reads the failed gates'
 *   verdicts through core's `configOnlyFiles` / `provenanceOnlyFiles` and, when one of those is the
 *   only problem, gives the send-back door the cause, files, card text and one finding per file
 *   so it can park the ticket for the owner. Config wins when both would apply (it never reworks);
 *   a provenance failure reworks first and only holds when `blockingRoute` says the cap is spent.
 *   Anything else, including verdicts lost in a restart, gets null: the ordinary road.
 *
 * Exports: gateHoldFields().
 * Depends on: @forge/core (configOnlyFiles, configHoldSummary, provenanceOnlyFiles, provenanceHoldSummary), types/verify. No IO.
 */

import {
  configHoldSummary,
  configOnlyFiles,
  provenanceHoldSummary,
  provenanceOnlyFiles,
} from '@forge/core';
import type { Finding, GateVerdict } from '@forge/core';
import type { GateHold } from '#/types/stage-runner.types.js';
import type { GateRows } from '#/types/verify.types.js';

const MAX_FILE = 500;

/** The cause, files, summary and per-file findings of a failure only the owner can settle, or null for any other failure. */
export function gateHoldFields(
  rows: GateRows,
  verdicts: ReadonlyMap<string, GateVerdict>,
): (GateHold & { readonly blocking: readonly Finding[] }) | null {
  const verdictsOf = rows
    .filter((r) => r.status === 'failed')
    .map((r) => verdicts.get(r.gate));

  const configFiles = configOnlyFiles(verdictsOf);
  if (configFiles !== null) {
    return {
      cause: 'config_hold',
      files: configFiles,
      summary: configHoldSummary(configFiles),
      blocking: configFiles.map((file) => ({
        severity: 'high',
        file: file.slice(0, MAX_FILE),
        issue: 'The Worker changed a file that controls how its work is checked.',
        evidence: `G1 gate-config: ${file} was changed by the Worker. Open it, then Merge anyway or send it back.`,
      })),
    };
  }

  const lostFiles = provenanceOnlyFiles(verdictsOf);
  if (lostFiles !== null) {
    return {
      cause: 'provenance_hold',
      files: lostFiles,
      summary: provenanceHoldSummary(lostFiles),
      blocking: lostFiles.map((file) => ({
        severity: 'high',
        file: file.slice(0, MAX_FILE),
        issue:
          'Forge cannot prove who changed this file: the earlier run that edited it left no proof.',
        evidence: `G1 claims: ${file} was changed by an earlier run whose record is gone. Check the change, then Merge anyway or send it back.`,
      })),
    };
  }

  return null;
}
