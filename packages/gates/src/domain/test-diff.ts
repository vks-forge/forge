/**
 * Test-diff gate — catches a Worker making tests pass by weakening them.
 *
 * Why: the cheapest way for an agent to turn a red suite green is to change the suite:
 *   delete a test file, add `.skip`/`.only`, drop an assertion or loosen `toBe(3)` to
 *   `toBeDefined()`. The project's own test run would then pass and say nothing. This
 *   gate reads the diff git computed and fails on those patterns. It is a deterministic
 *   heuristic, not a proof: it looks only at test files (see test-files), at added and
 *   removed lines, and it cannot see a weakened assertion that was rewritten beyond
 *   recognition.
 *
 * Rules (per test file in the diff):
 *   - file deleted, or renamed to a non-test path;
 *   - added line with `.skip`, `.only`, `.todo`, `xit(`, `xdescribe(`, `xtest(`, `fit(`, `fdescribe(`;
 *   - more removed assertion lines (`expect(`, `assert`) than added ones;
 *   - a removed `expect(X).<matcher>` re-added as `expect(X).<weak matcher>`;
 *   - fail closed: a test file whose hunks git printed as "Binary files differ" (e.g. a
 *     Worker-written `.gitattributes -diff`), or any `diff --git` header the parser could
 *     not read, because then nothing above could be checked.
 *
 * Exports: checkTestDiff().
 * Depends on: @forge/core (WorktreeDiff), domain/test-files, shared/paths. No IO.
 */

import type { GateFinding, WorktreeDiff } from '@forge/core';
import { isTestFile } from '#/domain/test-files.js';
import type { CheckOutcome, PatchFile } from '#/types/check.types.js';

const DISABLED = /\.(skip|only|todo)\b|\b(xit|xdescribe|xtest|fit|fdescribe)\s*\(/;
const ASSERTION = /\bexpect\s*\(|\bassert\b/;
const EXPECT = /expect\((.+?)\)\s*\.\s*((?:not\s*\.\s*)?\w+)/;
const WEAK = new Set([
  'tobedefined',
  'tobetruthy',
  'tobefalsy',
  'not.tobeundefined',
  'not.tobenull',
  'not.tobefalsy',
]);

function finding(path: string, message: string): GateFinding {
  return { check: 'test-diff', message: `${path}: ${message}` };
}

function matcherOf(line: string): { subject: string; matcher: string } | null {
  const m = EXPECT.exec(line);
  if (!m) {
    return null;
  }

  return {
    subject: (m[1] as string).trim(),
    matcher: (m[2] as string).replace(/\s+/g, '').toLowerCase(),
  };
}

function weakened(file: PatchFile): string[] {
  const before = new Map<string, string>();
  for (const line of file.removed) {
    const e = matcherOf(line);
    if (e && !WEAK.has(e.matcher)) {
      before.set(e.subject, e.matcher);
    }
  }

  const out: string[] = [];
  for (const line of file.added) {
    const e = matcherOf(line);
    const old = e ? before.get(e.subject) : undefined;
    if (e && old !== undefined && WEAK.has(e.matcher)) {
      out.push(
        `assertion weakened from .${old} to .${e.matcher} on expect(${e.subject})`,
      );
    }
  }

  return out;
}

function checkFile(file: PatchFile): GateFinding[] {
  const out: GateFinding[] = [];
  for (const line of file.added) {
    if (DISABLED.test(line)) {
      out.push(
        finding(file.path, `test disabled or focused by added line "${line.trim()}"`),
      );
    }
  }

  const dropped =
    file.removed.filter((l) => ASSERTION.test(l)).length -
    file.added.filter((l) => ASSERTION.test(l)).length;

  if (dropped > 0) {
    out.push(finding(file.path, `${dropped} more assertion line(s) removed than added`));
  }

  for (const w of weakened(file)) {
    out.push(finding(file.path, w));
  }

  return out;
}

/** Applies the test-diff rules to `diff`/`patch`. */
export function checkTestDiff(
  diff: WorktreeDiff,
  patch: readonly PatchFile[],
): CheckOutcome {
  const findings: GateFinding[] = [];
  for (const f of diff.files) {
    if (f.status === 'D' && isTestFile(f.path)) {
      findings.push(finding(f.path, 'test file deleted'));
    }

    if (
      f.status === 'R' &&
      f.oldPath !== undefined &&
      isTestFile(f.oldPath) &&
      !isTestFile(f.path)
    ) {
      findings.push(finding(f.oldPath, `test file renamed to non-test path ${f.path}`));
    }
  }

  for (const file of patch) {
    if (file.unparsed) {
      findings.push(
        finding(file.path, 'diff header could not be parsed; changes cannot be verified'),
      );
    } else if (file.binary && isTestFile(file.path)) {
      findings.push(
        finding(
          file.path,
          'test file diff is binary or hidden; its changes cannot be read',
        ),
      );
    }

    // Deleted files are judged from diff.files above; their removed lines are not "weakening".
    if (isTestFile(file.path) && !file.deleted) {
      findings.push(...checkFile(file));
    }
  }

  const details =
    findings.length === 0
      ? `${diff.files.length} changed file(s) inspected; no test was removed, disabled or weakened.`
      : findings.map((f) => `- ${f.message}`).join('\n');

  return {
    name: 'test-diff',
    status: findings.length === 0 ? 'passed' : 'failed',
    findings,
    details,
  };
}
