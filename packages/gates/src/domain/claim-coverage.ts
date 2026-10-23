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
 *   says which earlier run was set aside and why. When the only record of a file's edit is an
 *   earlier run whose run secret is gone (a ticket from before secrets were kept to ticket
 *   close), the finding says so in plain words and tells the Worker to re-apply the file through
 *   its edit/write tool and claim it: that rewrite produces ordinary receipts under the current
 *   run's secret, so nothing unverified is trusted. Those findings carry the file so the engine
 *   can offer the owner a vouch when a rework cannot help (F-D2, F-D3).
 *
 * Exports: coverage(), EDIT_TOOLS, reapplyMessage().
 * Depends on: @forge/core (Claim), domain/receipt-calls, shared/paths, types/check.types. No IO.
 */

import type { Claim, GateFinding } from '@forge/core';
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
      provenanceFiles: [],
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

  const lost = (ev.unverifiedEarlierRuns ?? [])
    .filter((u) => u.code === 'secret_gone')
    .map((u) => ({ runId: u.runId, calls: allowedCalls(u.receipts) }));

  const missing: string[] = [];
  const provenance: { path: string; runId: string }[] = [];
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
      // The set-aside run's receipts are unverified: they only say whom to name, never cover.
      const was = editedHere
        ? undefined
        : lost.find((r) =>
            touchedPath(r.calls, EDIT_TOOLS, COMMITTED, path, ev.worktreePath),
          );

      if (was === undefined) {
        missing.push(path);
      } else {
        provenance.push({ path, runId: was.runId });
      }
    } else {
      coveredByEarlier.set(path, by.runId);
    }
  }

  const setAside = (ev.unverifiedEarlierRuns ?? [])
    .map((u) => `${u.runId} (${u.reason})`)
    .join('; ');

  const findings: GateFinding[] = [];
  if (missing.length > 0) {
    findings.push({
      check: 'claims',
      message:
        `changed files not covered by any edited claim: ${missing.join(', ')}` +
        (setAside === ''
          ? ''
          : `. Earlier runs of the ticket give no cover: ${setAside}`),
    });
  }

  for (const { path, runId } of provenance) {
    findings.push({
      check: 'claims',
      file: path,
      message: reapplyMessage(path, runId),
    });
  }

  return {
    coveredByEarlier,
    findings,
    provenanceFiles: provenance.map((p) => p.path),
  };
}

/** The plain-words finding (and rework instruction) for a file whose only record is a run whose proof is gone. */
export function reapplyMessage(path: string, runId: string): string {
  return (
    `${path} was changed by earlier run ${runId}, but that run's proof is gone (its run secret was deleted), ` +
    `so Forge cannot tell who changed it. Fix: re-apply ${path} through your edit/write tool ` +
    `(rewrite it as it should be) and claim it as edited.`
  );
}
