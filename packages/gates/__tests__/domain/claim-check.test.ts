/**
 * Claim matcher tests — pin which evidence supports each Worker claim.
 *
 * Why: the claim matcher is what turns "I edited X / ran the tests" into something
 *   checkable. If it accepted a claim with no receipt, or one whose path never reached
 *   the diff, a Worker could merge on a false statement; if it rejected honest claims
 *   because of path spelling, every ticket would loop in rework.
 *
 * Pins: each claim kind supported and unsupported, path folding (case, backslash,
 *   absolute worktree prefix), denied receipts not counting, the quoted claim in findings.
 * Depends on: domain/claim-check, domain/patch, helpers/fixtures.
 */

import type { Claim } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { checkClaims } from '#/domain/claim-check.js';
import { parsePatch } from '#/domain/patch.js';
import { chain, diffOf, patchFor } from '#tests/helpers/fixtures.js';

const WT = 'D:/work/wt';

function run(
  claims: Claim[],
  calls: Parameters<typeof chain>[0],
  files: { status: 'A' | 'M' | 'D' | 'R'; path: string }[] = [],
  patch = '',
  testCommand: string | null = 'pnpm test',
) {
  return checkClaims(claims, {
    receipts: chain(calls),
    diff: diffOf(files, patch),
    patch: parsePatch(patch),
    testCommand: testCommand ?? undefined,
    worktreePath: WT,
  });
}

describe('checkClaims', () => {
  it('supports edited when an edit receipt and the diff both name the path', () => {
    const out = run(
      [{ kind: 'edited', path: 'src\\A.ts' }],
      [{ id: 't1', tool: 'edit', resource: 'src/a.ts' }],
      [{ status: 'M', path: 'src/A.ts' }],
    );

    expect(out.status).toBe('passed');
  });

  it('matches an absolute receipt resource inside the worktree', () => {
    const out = run(
      [{ kind: 'edited', path: 'src/a.ts' }],
      [{ id: 't1', tool: 'write', resource: 'D:\\Work\\wt\\src\\a.ts' }],
      [{ status: 'A', path: 'src/a.ts' }],
    );

    expect(out.status).toBe('passed');
  });

  it('fails edited with no receipt and quotes the claim', () => {
    const claim: Claim = { kind: 'edited', path: 'src/never.ts' };
    const out = run([claim], [], [{ status: 'M', path: 'src/other.ts' }]);

    expect(out.status).toBe('failed');
    expect(out.findings[0]?.claim).toEqual(claim);
    expect(out.findings[0]?.message).toContain('"path":"src/never.ts"');
  });

  it('fails edited when the receipt exists but the path is not in the diff', () => {
    const out = run(
      [{ kind: 'edited', path: 'src/a.ts' }],
      [{ id: 't1', tool: 'edit', resource: 'src/a.ts' }],
      [],
    );

    expect(out.findings[0]?.message).toContain('not in the git diff');
  });

  it('does not count a denied receipt or a failed effect', () => {
    const denied = run(
      [{ kind: 'edited', path: 'src/a.ts' }],
      [{ id: 't1', tool: 'edit', resource: 'src/a.ts', verdict: 'deny' }],
      [{ status: 'M', path: 'src/a.ts' }],
    );

    const failed = run(
      [{ kind: 'edited', path: 'src/a.ts' }],
      [{ id: 't1', tool: 'edit', resource: 'src/a.ts', state: 'uncertain' }],
      [{ status: 'M', path: 'src/a.ts' }],
    );

    expect(denied.status).toBe('failed');
    expect(failed.status).toBe('failed');
  });

  it('supports read only with a completed read receipt', () => {
    const ok = run(
      [{ kind: 'read', path: 'docs/x.md' }],
      [{ id: 'r', tool: 'read', resource: 'docs/x.md', state: 'read_completed' }],
    );

    const missing = run([{ kind: 'read', path: 'docs/x.md' }], []);

    expect(ok.status).toBe('passed');
    expect(missing.status).toBe('failed');
  });

  it('supports ran_tests from a shell receipt containing the test command', () => {
    const ok = run(
      [{ kind: 'ran_tests' }],
      [{ id: 's', tool: 'shell', resource: 'cd pkg ; PNPM   Test --run' }],
    );

    const other = run(
      [{ kind: 'ran_tests' }],
      [{ id: 's', tool: 'shell', resource: 'echo pnpm tes' }],
    );

    expect(ok.status).toBe('passed');
    expect(other.status).toBe('failed');
  });

  it('accepts a failed test run as having run, but needs a configured command', () => {
    const failedRun = run(
      [{ kind: 'ran_tests' }],
      [{ id: 's', tool: 'shell', resource: 'pnpm test', state: 'uncertain' }],
    );

    const noCommand = run(
      [{ kind: 'ran_tests' }],
      [{ id: 's', tool: 'shell', resource: 'pnpm test' }],
      [],
      '',
      null,
    );

    expect(failedRun.status).toBe('passed');
    expect(noCommand.findings[0]?.message).toContain('no test command');
  });

  it('supports added_test only from an added line of a test file', () => {
    const patch =
      patchFor('src/__tests__/a.test.ts', ["it('adds numbers', () => {})"]) +
      patchFor('src/a.ts', ["// it('only in source')"]);

    const ok = run([{ kind: 'added_test', name: 'adds numbers' }], [], [], patch);
    const inSource = run([{ kind: 'added_test', name: 'only in source' }], [], [], patch);

    expect(ok.status).toBe('passed');
    expect(inSource.status).toBe('failed');
  });

  it('passes with no claims', () => {
    expect(run([], []).status).toBe('passed');
  });
});
