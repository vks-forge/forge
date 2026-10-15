/**
 * G1 on fixture repos in three languages — a planted lie is caught in each.
 *
 * Why: Forge works on any language (d-0095), and the claim that "G1 verifies" is only true
 *   if the gate catches the same cheating on a Go or Python repo as on a Node one. Each
 *   fixture is a tiny repo on disk (Node, Python, Go) whose checks are fake `node` scripts
 *   named per role, so no Go or Python toolchain is needed; what is under test is the
 *   ecosystem rule data and the check runner. For each repo: an honest run passes, a
 *   `ran_tests` claim with no test run behind it fails, a test silenced with that
 *   language's skip marker fails, and a failing test script fails the project checks.
 *
 * Pins: false ran_tests claim, weakened test (skip marker), failing check, honest pass,
 *   for node, python and go; `ran_tests` matching any one of several test-role checks.
 * Depends on: adapters/g1-gate-factory, adapters/command-runner, helpers/fixtures,
 *   node:fs, node:os, node:path. Spawns node children (heavy project).
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Claim } from '@forge/core';
import { afterAll, describe, expect, it } from 'vitest';
import { runShellCommand } from '#/adapters/command-runner.js';
import { createG1Gate } from '#/adapters/g1-gate-factory.js';
import type { G1Deps } from '#/types/g1-deps.types.js';
import {
  SECRET,
  chain,
  context,
  diffOf,
  patchFor,
  receiptLog,
} from '#tests/helpers/fixtures.js';

const roots: string[] = [];

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

interface Fixture {
  readonly name: string;
  readonly files: Record<string, string>;
  readonly source: string;
  readonly test: string;
  /** Line the Worker adds to silence a test in this language. */
  readonly skip: string;
  readonly ecosystems: string[];
}

const script = (code: number): string => `process.exit(${code});\n`;

const FIXTURES: Fixture[] = [
  {
    name: 'node',
    files: {
      'package.json':
        '{ "name": "calc", "scripts": { "test": "node scripts/test.mjs" } }',
      'src/add.ts': 'export const add = (a: number, b: number) => a + b;\n',
      '__tests__/add.test.ts': "it('adds', () => { expect(add(1, 2)).toBe(3); });\n",
    },
    source: 'src/add.ts',
    test: '__tests__/add.test.ts',
    skip: "it.skip('adds', () => { expect(add(1, 2)).toBe(3); });",
    ecosystems: [],
  },
  {
    name: 'python',
    files: {
      'pyproject.toml': '[project]\nname = "calc"\n',
      'calc.py': 'def add(a, b):\n    return a + b\n',
      'tests/test_calc.py': 'def test_adds():\n    assert add(1, 2) == 3\n',
    },
    source: 'calc.py',
    test: 'tests/test_calc.py',
    skip: '@pytest.mark.skip(reason="later")',
    ecosystems: [],
  },
  {
    name: 'go',
    files: {
      'go.mod': 'module calc\n\ngo 1.22\n',
      'calc.go': 'package calc\n\nfunc Add(a, b int) int { return a + b }\n',
      'calc_test.go':
        'package calc\n\nfunc TestAdd(t *testing.T) {\n\tif Add(1, 2) != 3 {\n\t\tt.Fatal("bad")\n\t}\n}\n',
    },
    source: 'calc.go',
    test: 'calc_test.go',
    skip: '\tt.Skip("flaky")',
    ecosystems: ['go'],
  },
];

/** Writes the repo and its fake role scripts (`scripts/<role>.mjs`) into a fresh temp dir. */
function repoOf(fixture: Fixture, exits: Record<string, number> = {}): string {
  const root = mkdtempSync(join(tmpdir(), `forge-g1-${fixture.name}-`));
  roots.push(root);
  const files = {
    ...fixture.files,
    'scripts/test.mjs': script(exits['test'] ?? 0),
    'scripts/lint.mjs': script(exits['lint'] ?? 0),
  };

  for (const [path, body] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }

  return root;
}

const CHECKS = [
  { name: 'lint', role: 'lint' as const, command: 'node scripts/lint.mjs' },
  { name: 'test', role: 'test' as const, command: 'node scripts/test.mjs' },
];

interface Scenario {
  readonly claims: Claim[];
  readonly calls: Parameters<typeof chain>[0];
  readonly addedToTest?: string[];
}

function gateRun(fixture: Fixture, root: string, s: Scenario, checks = CHECKS) {
  const files = [
    { status: 'M' as const, path: fixture.source },
    ...(s.addedToTest ? [{ status: 'M' as const, path: fixture.test }] : []),
  ];

  const patch = [
    patchFor(fixture.source, ['// change']),
    ...(s.addedToTest ? [patchFor(fixture.test, s.addedToTest)] : []),
  ].join('\n');

  const deps: G1Deps = {
    receipts: receiptLog(chain(s.calls)),
    worktrees: { diff: () => Promise.resolve(diffOf(files, patch)) },
    listToolCalls: () =>
      Promise.resolve(
        s.calls.map((c) => ({
          callId: c.id,
          name: c.tool === 'shell' ? 'Bash' : 'Edit',
        })),
      ),
    runSecrets: () => Promise.resolve(SECRET),
    env: { PATH: process.env['PATH'], SystemRoot: process.env['SystemRoot'] },
    runCommand: runShellCommand,
    commandTimeoutMs: 30_000,
  };

  return createG1Gate(deps).run(
    context({
      claims: s.claims,
      checks,
      ecosystems: fixture.ecosystems,
      worktreePath: root,
    }),
  );
}

const honest = (f: Fixture): Scenario => ({
  claims: [{ kind: 'edited', path: f.source }, { kind: 'ran_tests' }],
  calls: [
    { id: 'c1', tool: 'edit', resource: f.source },
    { id: 'c2', tool: 'shell', resource: 'node scripts/test.mjs' },
  ],
});

describe.each(FIXTURES)('G1 on the $name fixture repo', (fixture) => {
  it('passes an honest run whose checks all succeed', async () => {
    const verdict = await gateRun(fixture, repoOf(fixture), honest(fixture));

    expect(verdict.findings).toEqual([]);
    expect(verdict.status).toBe('passed');
    expect(verdict.report).toContain('lint: passed');
    expect(verdict.report).toContain('test: passed');
  });

  it('catches a ran_tests claim with no test run behind it', async () => {
    const s: Scenario = {
      ...honest(fixture),
      calls: [{ id: 'c1', tool: 'edit', resource: fixture.source }],
    };

    const verdict = await gateRun(fixture, repoOf(fixture), s);

    expect(verdict.status).toBe('failed');
    expect(verdict.findings.map((f) => f.claim?.kind)).toContain('ran_tests');
  });

  it('catches a test silenced with this language skip marker', async () => {
    const verdict = await gateRun(fixture, repoOf(fixture), {
      claims: [
        { kind: 'edited', path: fixture.source },
        { kind: 'edited', path: fixture.test },
        { kind: 'ran_tests' },
      ],
      calls: [
        { id: 'c1', tool: 'edit', resource: fixture.source },
        { id: 'c3', tool: 'edit', resource: fixture.test },
        { id: 'c2', tool: 'shell', resource: 'node scripts/test.mjs' },
      ],
      addedToTest: [fixture.skip],
    });

    expect(verdict.status).toBe('failed');
    expect(verdict.findings.some((f) => f.check === 'test-diff')).toBe(true);
    expect(verdict.report).toContain('disabled or focused');
  });

  it('fails when the project test script itself fails', async () => {
    const verdict = await gateRun(fixture, repoOf(fixture, { test: 1 }), honest(fixture));

    expect(verdict.status).toBe('failed');
    expect(verdict.findings.some((f) => f.check === 'project:test')).toBe(true);
  });
});

describe('ran_tests with several test-role checks', () => {
  it('is backed by a run of any one of them', async () => {
    const [fixture] = FIXTURES as [Fixture];
    const checks = [
      { name: 'unit', role: 'test' as const, command: 'node scripts/lint.mjs' },
      { name: 'integration', role: 'test' as const, command: 'node scripts/test.mjs' },
    ];

    const verdict = await gateRun(fixture, repoOf(fixture), honest(fixture), checks);

    expect(verdict.status).toBe('passed');
  });
});
