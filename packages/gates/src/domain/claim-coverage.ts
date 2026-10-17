/**
 * Diff coverage — every changed file must be explained by a claim or by proven earlier work.
 *
 * Why: a Worker could edit a file and never mention it. G1 therefore requires each changed
 *   file to be named by an `edited` claim of this run. A rework run reuses the ticket's
 *   branch, which already holds the files earlier runs edited, so those files cannot be
 *   claimed by a run that never touched them; they are covered instead by a committed edit
 *   receipt from an earlier run whose chain verified (checks in domain/earlier-runs). A file
 *   this run edited itself always needs its own claim, so earlier cover cannot hide a fresh,
 *   unclaimed edit. A forged or unverifiable earlier chain covers nothing, and the finding
 *   says which earlier run was set aside and why.
 *
 * Exports: coverage(), EDIT_TOOLS.
 * Depends on: @forge/core (Claim), domain/receipt-calls, shared/paths, types/check.types. No IO.
 */

import type { Claim } from '@forge/core';
import { allowedCalls, touchedPath } from '#/domain/receipt-calls.js';
import { foldPath } from '#/shared/paths.js';
import type {
  AllowedCall as Allowed,
  ClaimEvidence,
  Coverage,
} from '#/types/check.types.js';

export const EDIT_TOOLS: ReadonlySet<string> = new Set(['edit', 'write']);
const COMMITTED: ReadonlySet<string> = new Set(['mutation_committed']);

const LOCKFILE =
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb|cargo\.lock|poetry\.lock)$/;

/** Findings for a diff nobody claimed: no claims at all, or files neither claimed nor proven earlier. */
export function coverage(claims: readonly Claim[], ev: ClaimEvidence): Coverage {
  const files = ev.diff.files.filter((f) => f.status !== 'D');
  const coveredByEarlier = new Map<string, string>();
  if (claims.length === 0) {
    return {
      coveredByEarlier,
      findings:
        ev.diff.files.length === 0
          ? []
          : [
              {
                check: 'claims',
                message: `finish carried no claims for ${ev.diff.files.length} changed files; the Worker must say what it did`,
              },
            ],
    };
  }

  const claimed = new Set(
    claims.flatMap((c) =>
      c.kind === 'edited' ? [foldPath(c.path, ev.worktreePath)] : [],
    ),
  );

  const own = allowedCalls(ev.receipts);
  const earlier: { runId: string; calls: Allowed[] }[] = (ev.earlierRuns ?? []).map(
    (r) => ({ runId: r.runId, calls: allowedCalls(r.receipts) }),
  );

  const missing: string[] = [];
  for (const { path } of files) {
    const folded = foldPath(path, ev.worktreePath);
    if (LOCKFILE.test(foldPath(path)) || claimed.has(folded)) {
      continue;
    }

    const editedHere = touchedPath(own, EDIT_TOOLS, COMMITTED, path, ev.worktreePath);
    const by = editedHere
      ? undefined
      : earlier.find((r) =>
          touchedPath(r.calls, EDIT_TOOLS, COMMITTED, path, ev.worktreePath),
        );

    if (by === undefined) {
      missing.push(path);
    } else {
      coveredByEarlier.set(path, by.runId);
    }
  }

  const setAside = (ev.unverifiedEarlierRuns ?? [])
    .map((u) => `${u.runId} (${u.reason})`)
    .join('; ');

  return {
    coveredByEarlier,
    findings:
      missing.length === 0
        ? []
        : [
            {
              check: 'claims',
              message:
                `changed files not covered by any edited claim: ${missing.join(', ')}` +
                (setAside === ''
                  ? ''
                  : `. Earlier runs of the ticket give no cover: ${setAside}`),
            },
          ],
  };
}
