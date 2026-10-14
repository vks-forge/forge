/**
 * G1 gate integration tests — pin the verdict semantics end to end with fakes.
 *
 * Why: this is the slice exit criterion. A Worker that claims it edited a file it never
 *   touched must fail G1 with the claim quoted, an honest run must pass, and a missing
 *   run secret must fail the gate so the engine never merges on unverified evidence
 *   and the rework starts a fresh run instead of parking on the same missing secret.
 *
 * Pins: planted false claim fails, honest run passes with a readable report, missing
 *   secret fails with a restart finding, ignored tool calls, failing command fails, diff read against base.
 * Depends on: domain/g1-gate, helpers/fixtures.
 */

import type { Claim } from '@forge/core';
import { describe, expect, it } from 'vitest';
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

const GOOD_CALLS = [
  { id: 'c1', tool: 'edit', resource: 'src/a.ts' },
  { id: 'c2', tool: 'shell', resource: 'pnpm test' },
];

function deps(over: Partial<G1Deps> = {}): G1Deps {
  return {
    receipts: receiptLog(chain(GOOD_CALLS)),
    worktrees: {
      diff: () =>
        Promise.resolve(
          diffOf([{ status: 'M', path: 'src/a.ts' }], patchFor('src/a.ts', ['x'])),
        ),
    },
    listToolCalls: () =>
      Promise.resolve([
        { callId: 'c1', name: 'Edit' },
        { callId: 'c2', name: 'Bash' },
      ]),
    runSecret: () => SECRET,
    env: {},
    runCommand: () => Promise.resolve({ exitCode: 0, timedOut: false, output: '' }),
    now: () => new Date('2026-01-01T00:00:00Z'),
    ...over,
  };
}

// The honest default: one edited file in the diff, covered by an `edited` claim.
const ctx = (claims: readonly Claim[] = [{ kind: 'edited', path: 'src/a.ts' }]) =>
  context({ claims, commands: { test: 'pnpm test', lint: 'pnpm lint' } });

describe('createG1Gate', () => {
  it('is named G1', () => {
    expect(createG1Gate(deps()).name).toBe('G1');
  });

  it('passes an honest run and renders one section per check', async () => {
    const verdict = await createG1Gate(deps()).run(
      ctx([{ kind: 'edited', path: 'src/a.ts' }, { kind: 'ran_tests' }]),
    );

    expect(verdict.status).toBe('passed');
    expect(verdict.findings).toEqual([]);
    expect(verdict.report).toContain('# G1 report: passed');
    for (const name of [
      'chain',
      'claims',
      'test-diff',
      'gate-config',
      'project-checks',
    ]) {
      expect(verdict.report).toContain(`## ${name}: passed`);
    }
  });

  it('fails a planted false claim and quotes it', async () => {
    const claim = { kind: 'edited', path: 'src/never-touched.ts' } as const;

    const verdict = await createG1Gate(deps()).run(
      ctx([claim, { kind: 'edited', path: 'src/a.ts' }]),
    );

    expect(verdict.status).toBe('failed');
    expect(verdict.findings).toHaveLength(1);
    expect(verdict.findings[0]?.claim).toEqual(claim);
    expect(verdict.report).toContain('src/never-touched.ts');
  });

  it('fails a non-empty diff whose finish carried no claims', async () => {
    const verdict = await createG1Gate(deps()).run(ctx([]));

    expect(verdict.status).toBe('failed');
    expect(verdict.report).toContain('no claims for 1 changed files');
  });

  it('carries the output tail in the rework findings', async () => {
    const verdict = await createG1Gate(
      deps({
        runCommand: () =>
          Promise.resolve({
            exitCode: 1,
            timedOut: false,
            output: 'AssertionError: 3 != 4',
          }),
      }),
    ).run(ctx());

    expect(verdict.findings[0]?.message).toContain('AssertionError: 3 != 4');
  });

  it('forwards passEnv to the runner environment', async () => {
    let seen: Readonly<Record<string, string>> = {};

    await createG1Gate(
      deps({
        env: { PATH: '/bin', EXTRA: 'e', ANTHROPIC_API_KEY: 'k' },
        passEnv: ['EXTRA'],
        runCommand: (r) => {
          seen = r.env;

          return Promise.resolve({ exitCode: 0, timedOut: false, output: '' });
        },
      }),
    ).run(ctx());

    expect(seen['EXTRA']).toBe('e');
    expect(seen['ANTHROPIC_API_KEY']).toBeUndefined();
  });

  it('fails when a tool call has no receipt', async () => {
    const verdict = await createG1Gate(
      deps({
        listToolCalls: () => Promise.resolve([{ callId: 'ghost', name: 'Bash' }]),
      }),
    ).run(ctx());

    expect(verdict.status).toBe('failed');
  });

  it('skips tool calls the caller marks as receipt-less', async () => {
    const verdict = await createG1Gate(
      deps({
        listToolCalls: () => Promise.resolve([{ callId: 'ghost', name: 'internal' }]),
        ignoreToolCall: (c) => c.name === 'internal',
      }),
    ).run(ctx());

    expect(verdict.status).toBe('passed');
  });

  it('fails with a restart finding when the run secret is gone, so rework re-runs the ticket', async () => {
    const verdict = await createG1Gate(deps({ runSecret: () => null })).run(ctx());

    expect(verdict.status).toBe('failed');
    expect(verdict.findings).toEqual([
      expect.objectContaining({
        check: 'chain',
        message: expect.stringContaining('unverifiable after restart'),
      }),
    ]);

    expect(verdict.report).toContain('## chain: failed');
  });

  it('fails when a project command fails', async () => {
    const verdict = await createG1Gate(
      deps({
        runCommand: () =>
          Promise.resolve({ exitCode: 1, timedOut: false, output: 'red' }),
      }),
    ).run(ctx());

    expect(verdict.status).toBe('failed');
    expect(verdict.report).toContain('red');
  });

  it('reads the diff of the run worktree against its base sha', async () => {
    const seen: string[] = [];

    await createG1Gate(
      deps({
        worktrees: {
          diff: (path, sha) => {
            seen.push(path, sha);

            return Promise.resolve(diffOf([]));
          },
        },
      }),
    ).run(ctx());

    expect(seen).toEqual(['/wt', 'base']);
  });
});
