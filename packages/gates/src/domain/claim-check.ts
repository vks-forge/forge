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
 * Match rules (receipts are the gated run's own unless noted):
 *   edited P     allowed `edit`/`write` decision on P with a `mutation_committed` effect,
 *                in this run or, for a rework, an earlier run of the ticket (that edit is
 *                in the branch already), and P is in the diff (paths folded: slashes,
 *                case, worktree prefix).
 *   read P       allowed `read` decision on P with a `read_completed` effect.
 *   ran_tests    allowed `shell` decision with a completed effect (`mutation_committed`,
 *                or `uncertain` for a failed run, which still ran; the report says so)
 *                one of whose segments starts with the command of ANY test-role check (see shell-match).
 *   added_test N an added line of a test file declares a test (`it(`, `def test_`, `func Test`, `fn`, ...,
 *                per active ecosystem) whose title or name contains N; comments and strings do not count.
 *
 * Coverage (no vacuous pass): a non-empty diff with no claims at all is a finding, and every
 * changed file other than lockfiles and deletions must be named by an `edited` claim.
 *
 * Exports: checkClaims().
 * Depends on: @forge/core (Claim), @forge/tools (Receipt), domain/{test-files,shell-match,gate-rules}, shared/paths. No IO.
 */

import type { Claim, GateFinding } from '@forge/core';
import type { Receipt } from '@forge/tools';
import { ALL_RULES } from '#/domain/gate-rules.js';
import { runsAnyTestCommand } from '#/domain/shell-match.js';
import { declaresTest, isTestPatch } from '#/domain/test-files.js';
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

/** Allowed, completed shell calls whose command runs the project's test command. */
function testRuns(calls: readonly Allowed[], testCommands: readonly string[]): Allowed[] {
  return calls.filter(
    (c) =>
      c.decision.tool === 'shell' &&
      c.state !== undefined &&
      SHELL_DONE.has(c.state) &&
      runsAnyTestCommand(c.decision.resource, testCommands),
  );
}

function judge(
  claim: Claim,
  calls: readonly Allowed[],
  editCalls: readonly Allowed[],
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
          editCalls,
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
      if (ev.testCommands.length === 0) {
        return 'the project defines no test command to match a shell receipt against';
      }

      return testRuns(calls, ev.testCommands).length > 0
        ? null
        : `no allowed shell receipt running ${ev.testCommands.map((c) => `"${c}"`).join(' or ')}`;
    }

    case 'added_test': {
      const rules = ev.rules ?? ALL_RULES;
      const found = ev.patch.some(
        (f) =>
          isTestPatch(f, rules) &&
          f.added.some((line) => declaresTest(line, claim.name, rules)),
      );

      return found
        ? null
        : 'the name appears on no added line of a test file in the diff';
    }
  }
}

const LOCKFILE =
  /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb|cargo\.lock|poetry\.lock)$/;

/** Findings for a diff nobody claimed: no claims at all, or files no `edited` claim names. */
function coverage(claims: readonly Claim[], ev: ClaimEvidence): GateFinding[] {
  const files = ev.diff.files.filter((f) => f.status !== 'D');
  if (claims.length === 0) {
    return ev.diff.files.length === 0
      ? []
      : [
          {
            check: 'claims',
            message: `finish carried no claims for ${ev.diff.files.length} changed files; the Worker must say what it did`,
          },
        ];
  }

  const claimed = new Set(
    claims.flatMap((c) =>
      c.kind === 'edited' ? [foldPath(c.path, ev.worktreePath)] : [],
    ),
  );

  const missing = files
    .map((f) => f.path)
    .filter(
      (p) => !LOCKFILE.test(foldPath(p)) && !claimed.has(foldPath(p, ev.worktreePath)),
    );

  return missing.length === 0
    ? []
    : [
        {
          check: 'claims',
          message: `changed files not covered by any edited claim: ${missing.join(', ')}`,
        },
      ];
}

/** Every claim must be supported and the diff covered; each failure is a finding. */
export function checkClaims(claims: readonly Claim[], ev: ClaimEvidence): CheckOutcome {
  const calls = allowedCalls(ev.receipts);
  // Earlier runs' receipts feed `edited` only; every other kind needs this run's own.
  const editCalls = [...allowedCalls(ev.earlierReceipts ?? []), ...calls];
  const findings: GateFinding[] = [];
  for (const claim of claims) {
    const why = judge(claim, calls, editCalls, ev);
    if (why !== null) {
      findings.push(unsupported(claim, why));
    }
  }

  findings.push(...coverage(claims, ev));

  const notes: string[] = [];
  const claimedTests = claims.some((c) => c.kind === 'ran_tests');
  if (claimedTests && ev.testCommands.length > 0) {
    const runs = testRuns(calls, ev.testCommands);
    if (runs.length > 0 && runs.every((c) => c.state === 'uncertain')) {
      notes.push(
        'ran_tests counted from a shell run that failed or did not complete; the tests did run.',
      );
    }
  }

  const details =
    findings.length === 0
      ? [
          `${claims.length} claim(s), all supported by receipts and the diff.`,
          ...notes,
        ].join('\n')
      : findings.map((f) => `- ${f.message}`).join('\n');

  return {
    name: 'claims',
    status: findings.length === 0 ? 'passed' : 'failed',
    findings,
    details,
  };
}
