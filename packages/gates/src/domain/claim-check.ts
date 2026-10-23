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
 *   read P       allowed decision of any tool with a `read_completed` effect (only a read-risk tool
 *                ends there) on P or on a folder containing P (`grep` over `src` read `src/a.ts`;
 *                `.` and the worktree root contain everything), in this run or an earlier verified
 *                run of the ticket (the Worker's session may be resumed). The report says when a
 *                folder search backed it.
 *   ran_tests    allowed `shell` decision with a completed effect (`mutation_committed`,
 *                or `uncertain` for a failed run, which still ran; the report says so)
 *                one of whose segments starts with the command of ANY test-role check (see shell-match).
 *   added_test N an added line of a test file declares a test (`it(`, `def test_`, `func Test`, `fn`, ...,
 *                per active ecosystem) whose title or name contains N, or whose title N ends with
 *                after a group prefix (`describe › it`, `Class::test_x`); comments and strings do not count.
 *
 * Coverage (no vacuous pass, domain/claim-coverage): a non-empty diff with no claims at all is
 * a finding, and every changed file other than lockfiles and deletions must be named by an
 * `edited` claim or edited by an earlier verified run of the ticket. Earlier runs reach this
 * check already verified (domain/earlier-runs), never raw.
 *
 * Exports: checkClaims().
 * Depends on: @forge/core (Claim), domain/{test-files,shell-match,gate-rules,receipt-calls,claim-coverage}, shared/paths. No IO.
 */

import type { Claim, GateFinding } from '@forge/core';
import { coverage, EDIT_TOOLS } from '#/domain/claim-coverage.js';
import { ALL_RULES } from '#/domain/gate-rules.js';
import { allowedCalls, readBacking, touchedPath } from '#/domain/receipt-calls.js';
import { runsAnyTestCommand } from '#/domain/shell-match.js';
import { declaresTest, isTestPatch } from '#/domain/test-files.js';
import { foldPath } from '#/shared/paths.js';
import type {
  AllowedCall as Allowed,
  CheckOutcome,
  ClaimEvidence,
} from '#/types/check.types.js';

const SHELL_DONE = new Set(['mutation_committed', 'uncertain']);

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
  provenCalls: readonly Allowed[],
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
          provenCalls,
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
      return readBacking(provenCalls, claim.path, ev.worktreePath) === null
        ? 'no allowed read receipt with a completed effect for that path or a folder containing it'
        : null;

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

/** Every claim must be supported and the diff covered; each failure is a finding. */
export function checkClaims(claims: readonly Claim[], ev: ClaimEvidence): CheckOutcome {
  const calls = allowedCalls(ev.receipts);
  // Verified earlier runs of the ticket back `edited` and `read`; ran_tests and added_test
  // say something about the code as it is now and need this run's own evidence.
  const provenCalls = [
    ...(ev.earlierRuns ?? []).flatMap((r) => allowedCalls(r.receipts)),
    ...calls,
  ];

  const findings: GateFinding[] = [];
  for (const claim of claims) {
    const why = judge(claim, calls, provenCalls, ev);
    if (why !== null) {
      findings.push(unsupported(claim, why));
    }
  }

  const covered = coverage(claims, ev);
  findings.push(...covered.findings);

  const notes: string[] = [];
  for (const claim of claims) {
    if (claim.kind !== 'read') {
      continue;
    }

    const folder = readBacking(provenCalls, claim.path, ev.worktreePath)?.folder;
    if (typeof folder === 'string') {
      notes.push(`read ${claim.path} backed by a search over ${folder}.`);
    }
  }

  for (const [path, runId] of covered.coveredByEarlier) {
    notes.push(`${path} covered by the verified edit receipts of earlier run ${runId}.`);
  }

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
    // Only lost-proof findings, none about an unsupported claim or an uncovered file (F-D3).
    ...(covered.provenanceFiles.length > 0 &&
    findings.length === covered.provenanceFiles.length
      ? { provenanceOnly: true }
      : {}),
  };
}
