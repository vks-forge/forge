/**
 * Claim matcher — checks each Worker claim against receipts and the git diff.
 *
 * Why: Workers overstate ("I ran the tests", "I edited X"). Their `finish` claims are the
 *   one place they say so in a typed form, and every one is checkable against evidence
 *   they cannot forge: the HMAC-chained decision receipts (what policy allowed and what
 *   happened) and the diff git computed. A claim with no matching evidence fails G1 with
 *   the claim quoted, so the rework prompt says exactly which statement was false
 *   (verification-plane.md §2).
 *
 * Match rules:
 *   edited P     allowed `edit`/`write` decision on P with a `mutation_committed` effect,
 *                and P is in the diff (paths folded: slashes, case, worktree prefix).
 *   read P       allowed `read` decision on P with a `read_completed` effect.
 *   ran_tests    allowed `shell` decision with a completed effect (`mutation_committed`,
 *                or `uncertain` for a failed run, which still ran) whose resource contains
 *                `commands.test` after whitespace and case folding, per ` ; ` segment.
 *   added_test N N appears in an added line of a test file in the diff.
 *
 * Exports: checkClaims().
 * Depends on: @forge/core (Claim), @forge/tools (Receipt), domain/test-files, shared/paths. No IO.
 */

import type { Claim, GateFinding } from '@forge/core';
import type { Receipt } from '@forge/tools';
import { isTestFile } from '#/domain/test-files.js';
import { foldPath } from '#/shared/paths.js';
import type {
  AllowedCall as Allowed,
  CheckOutcome,
  ClaimEvidence,
} from '#/types/check.types.js';

const EDIT_TOOLS = new Set(['edit', 'write']);
const SHELL_DONE = new Set(['mutation_committed', 'uncertain']);

function allowedCalls(receipts: readonly Receipt[]): Allowed[] {
  const states = new Map<string, string>();
  for (const r of receipts) {
    if (r.kind === 'effect') {
      states.set(r.decision_id, r.state);
    }
  }

  const out: Allowed[] = [];
  for (const r of receipts) {
    if (r.kind === 'decision' && r.decision === 'allow') {
      out.push({ decision: r, state: states.get(r.id) });
    }
  }

  return out;
}

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** True when any ` ; ` segment of the recorded shell resource contains the test command. */
function runsTestCommand(resource: string | null, testCommand: string): boolean {
  if (resource === null) {
    return false;
  }

  const wanted = squash(testCommand);

  return resource.split(' ; ').some((segment) => squash(segment).includes(wanted));
}

function touchedPath(
  calls: readonly Allowed[],
  tools: ReadonlySet<string>,
  state: ReadonlySet<string>,
  path: string,
  worktreePath: string,
): boolean {
  const wanted = foldPath(path, worktreePath);

  return calls.some(
    (c) =>
      tools.has(c.decision.tool) &&
      c.state !== undefined &&
      state.has(c.state) &&
      c.decision.resource !== null &&
      foldPath(c.decision.resource, worktreePath) === wanted,
  );
}

function unsupported(claim: Claim, why: string): GateFinding {
  return {
    check: 'claims',
    message: `Unsupported claim ${JSON.stringify(claim)}: ${why}`,
    claim,
  };
}

function judge(
  claim: Claim,
  calls: readonly Allowed[],
  ev: ClaimEvidence,
): string | null {
  switch (claim.kind) {
    case 'edited': {
      const wanted = foldPath(claim.path, ev.worktreePath);
      const inDiff = ev.diff.files.some(
        (f) => foldPath(f.path, ev.worktreePath) === wanted,
      );

      if (
        !touchedPath(
          calls,
          EDIT_TOOLS,
          new Set(['mutation_committed']),
          claim.path,
          ev.worktreePath,
        )
      ) {
        return 'no allowed edit or write receipt with a committed effect for that path';
      }

      return inDiff ? null : 'the path is not in the git diff against the run base';
    }

    case 'read':
      return touchedPath(
        calls,
        new Set(['read']),
        new Set(['read_completed']),
        claim.path,
        ev.worktreePath,
      )
        ? null
        : 'no allowed read receipt with a completed effect for that path';
    case 'ran_tests': {
      if (ev.testCommand === undefined) {
        return 'the project defines no test command to match a shell receipt against';
      }

      const ran = calls.some(
        (c) =>
          c.decision.tool === 'shell' &&
          c.state !== undefined &&
          SHELL_DONE.has(c.state) &&
          runsTestCommand(c.decision.resource, ev.testCommand as string),
      );

      return ran ? null : `no allowed shell receipt running "${ev.testCommand}"`;
    }

    case 'added_test': {
      const found = ev.patch.some(
        (f) => isTestFile(f.path) && f.added.some((line) => line.includes(claim.name)),
      );

      return found
        ? null
        : 'the name appears on no added line of a test file in the diff';
    }
  }
}

/** Every claim must be supported; each unsupported one is a finding quoting it. */
export function checkClaims(claims: readonly Claim[], ev: ClaimEvidence): CheckOutcome {
  const calls = allowedCalls(ev.receipts);
  const findings: GateFinding[] = [];
  for (const claim of claims) {
    const why = judge(claim, calls, ev);
    if (why !== null) {
      findings.push(unsupported(claim, why));
    }
  }

  const details =
    findings.length === 0
      ? `${claims.length} claim(s), all supported by receipts and the diff.`
      : findings.map((f) => `- ${f.message}`).join('\n');

  return {
    name: 'claims',
    status: findings.length === 0 ? 'passed' : 'failed',
    findings,
    details,
  };
}
