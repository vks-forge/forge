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

import type { Claim, WorktreeDiffFile } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { checkClaims } from '#/domain/claim-check.js';
import { parsePatch } from '#/domain/patch.js';
import { chain, diffOf, patchFor } from '#tests/helpers/fixtures.js';

const WT = 'D:/work/wt';

function run(
  claims: Claim[],
  calls: Parameters<typeof chain>[0],
  files: WorktreeDiffFile[] = [],
  patch = '',
  testCommands: readonly string[] = ['pnpm test'],
) {
  return checkClaims(claims, {
    receipts: chain(calls),
    diff: diffOf(files, patch),
    patch: parsePatch(patch),
    testCommands,
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
      [],
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

  it.each([
    'echo pnpm test',
    'git commit -m "pnpm test"',
    'pnpm test --help',
    'pnpm test -h',
    'pnpm test --version',
    'pnpm test | cat',
    'cat notes.txt ; echo pnpm test',
    'true && pnpm testing',
  ])(
    'does not accept the trivial shell receipt "%s" as running the tests',
    (resource) => {
      const out = run([{ kind: 'ran_tests' }], [{ id: 's', tool: 'shell', resource }]);

      expect(out.status).toBe('failed');
    },
  );

  it.each([
    'pnpm test',
    'cd pkg ; pnpm test --run',
    'pnpm lint && pnpm   TEST',
    'false || pnpm test -- a.test.ts',
    'CI=1 pnpm test',
  ])('accepts the shell receipt "%s" as running the tests', (resource) => {
    const out = run([{ kind: 'ran_tests' }], [{ id: 's', tool: 'shell', resource }]);

    expect(out.status).toBe('passed');
  });

  it('counts a failed run as having run but says so in the report', () => {
    const out = run(
      [{ kind: 'ran_tests' }],
      [{ id: 's', tool: 'shell', resource: 'pnpm test', state: 'uncertain' }],
    );

    expect(out.status).toBe('passed');
    expect(out.details).toContain('failed');
  });

  it.each([
    "// it('adds numbers', () => {})",
    "  /* test('adds numbers') */",
    'const s = "it(\'adds numbers\'"',
    "it('subtracts', () => {}) // adds numbers",
    "console.log('adds numbers')",
  ])('does not accept %s as an added test', (line) => {
    const out = run(
      [{ kind: 'added_test', name: 'adds numbers' }],
      [],
      [],
      patchFor('src/__tests__/a.test.ts', [line]),
    );

    expect(out.status).toBe('failed');
  });

  it.each([
    "  it('adds numbers', () => {})",
    'test("adds numbers and more", () => {})',
    'describe.only(`adds numbers`, () => {})',
    "it.each([1])('adds numbers %s', () => {})",
  ])('accepts %s as an added test', (line) => {
    const out = run(
      [{ kind: 'added_test', name: 'adds numbers' }],
      [],
      [],
      patchFor('src/__tests__/a.test.ts', [line]),
    );

    expect(out.status).toBe('passed');
  });

  it('fails a non-empty diff that carries no claims', () => {
    const out = run(
      [],
      [],
      [
        { status: 'M', path: 'src/a.ts' },
        { status: 'A', path: 'src/b.ts' },
      ],
    );

    expect(out.status).toBe('failed');
    expect(out.findings[0]?.message).toContain('no claims for 2 changed files');
  });

  it('fails changed files no edited claim covers, but not lockfiles or deletions', () => {
    const out = run(
      [{ kind: 'edited', path: 'src/a.ts' }],
      [{ id: 't1', tool: 'edit', resource: 'src/a.ts' }],
      [
        { status: 'M', path: 'src/a.ts' },
        { status: 'M', path: 'src/sneaky.ts' },
        { status: 'M', path: 'pnpm-lock.yaml' },
        { status: 'M', path: 'sub/Cargo.lock' },
        { status: 'D', path: 'src/gone.ts' },
      ],
    );

    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]?.message).toContain('src/sneaky.ts');
    expect(out.findings[0]?.message).not.toContain('lock');
    expect(out.findings[0]?.message).not.toContain('gone');
  });

  it('covers a renamed file by an edited claim on its new path', () => {
    const out = run(
      [{ kind: 'edited', path: 'src/new.ts' }],
      [{ id: 't1', tool: 'write', resource: 'src/new.ts' }],
      [{ status: 'R', path: 'src/new.ts', oldPath: 'src/old.ts' }],
    );

    expect(out.status).toBe('passed');
  });
});
