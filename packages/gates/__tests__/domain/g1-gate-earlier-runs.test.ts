/**
 * G1 on a rework run that inherits the ticket's branch: earlier runs' proven work counts.
 *
 * Why: a rework or retry run reuses the branch, which already holds the edits of the runs
 *   before it, yet G1 diffs the whole branch. Judging only this run's receipts failed every
 *   rework (live ticket DCP-6): files the earlier run edited were "not covered by any edited
 *   claim", and a file the Worker had read in an earlier run had "no read receipt". The fix
 *   counts earlier runs of the ticket, but only if their receipt chains verify under their
 *   own secrets, so a forged or unverifiable earlier chain buys the Worker nothing.
 *
 * Pins: files edited by two earlier runs (parallel writers) are covered by the third; files edited by an earlier run are covered without a claim; a read claim is backed by
 *   an earlier run's read receipt; a forged earlier chain and an earlier run whose secret is
 *   gone give no cover and the report says why; a file nobody's receipts cover still fails; a
 *   file this run edited itself still needs its own edited claim; the report names the run
 *   that covered a file; ran_tests still needs this run's own receipt.
 * Depends on: adapters/g1-gate-factory, helpers/fixtures.
 */

import type { Claim } from '@forge/core';
import { describe, expect, it } from 'vitest';
import { createG1Gate } from '#/adapters/g1-gate-factory.js';
import type { G1Deps } from '#/types/g1-deps.types.js';
import {
  SECRET,
  chain,
  checksOf,
  context,
  diffOf,
  patchFor,
} from '#tests/helpers/fixtures.js';

const OTHER_SECRET = 'other-run-secret-0123456789abcdef-0123456';
const FILES = ['README.md', 'src/app.js', 'src/todos.js'];

type Rows = ReturnType<typeof chain>;

function deps(
  runs: { own: Rows; earlier?: Record<string, Rows> },
  secrets: Record<string, string | null> = {},
  over: Partial<G1Deps> = {},
): G1Deps {
  const earlier = runs.earlier ?? {};

  return {
    receipts: {
      append: () => Promise.reject(new Error('read-only fake')),
      list: (id) => Promise.resolve(earlier[id] ?? runs.own),
    },
    worktrees: {
      diff: () =>
        Promise.resolve(
          diffOf(
            FILES.map((path) => ({ status: 'M' as const, path })),
            FILES.map((p) => patchFor(p, ['x'])).join(''),
          ),
        ),
    },
    listToolCalls: () => Promise.resolve([]),
    earlierRunIds: () => Promise.resolve(Object.keys(earlier)),
    runSecrets: (runId) =>
      Promise.resolve(runId in secrets ? (secrets[runId] ?? null) : SECRET),
    env: {},
    runCommand: () => Promise.resolve({ exitCode: 0, timedOut: false, output: '' }),
    now: () => new Date('2026-01-01T00:00:00Z'),
    ...over,
  };
}

const ctx = (claims: readonly Claim[]) =>
  context({ claims, checks: checksOf({ test: 'pnpm test' }) });

const edit = (id: string, resource: string) => ({ id, tool: 'edit', resource });
const claimed = (...paths: string[]): Claim[] =>
  paths.map((path) => ({ kind: 'edited', path }));

const earlierEdits = (): Rows => chain(FILES.map((f, i) => edit(`e${i}`, f)));

describe('G1 with earlier runs of the ticket', () => {
  it('covers files an earlier run edited when the rework run claims only its own', async () => {
    const own = chain([edit('o1', 'src/todos.js')]);

    const verdict = await createG1Gate(
      deps({ own, earlier: { 'run-0': earlierEdits() } }),
    ).run(ctx(claimed('src/todos.js')));

    expect(verdict.status).toBe('passed');
    expect(verdict.report).toContain('run-0');
    expect(verdict.report).toContain('README.md');
  });

  it("covers files two other runs' receipts edited when the assignee claims only its own", async () => {
    const own = chain([edit('o1', 'src/todos.js')]);

    const verdict = await createG1Gate(
      deps({
        own,
        earlier: {
          'run-a': chain([edit('a1', 'README.md')]),
          'run-b': chain([edit('b1', 'src/app.js')]),
        },
      }),
    ).run(ctx(claimed('src/todos.js')));

    expect(verdict.status).toBe('passed');
    expect(verdict.report).toContain('run-a');
    expect(verdict.report).toContain('run-b');
  });

  it('backs a read claim with an earlier run read receipt', async () => {
    const earlier = chain([
      ...FILES.map((f, i) => edit(`e${i}`, f)),
      { id: 'r1', tool: 'read', resource: 'README.md', state: 'read_completed' },
    ]);

    const verdict = await createG1Gate(
      deps({ own: chain([]), earlier: { 'run-0': earlier } }),
    ).run(ctx([{ kind: 'read', path: 'README.md' }, ...claimed('src/app.js')]));

    expect(verdict.status).toBe('passed');
  });

  it('gives no cover for an earlier chain forged under another secret', async () => {
    const forged = chain(
      FILES.map((f, i) => edit(`e${i}`, f)),
      OTHER_SECRET,
    );

    const verdict = await createG1Gate(
      deps({ own: chain([]), earlier: { 'run-0': forged } }),
    ).run(ctx(claimed('src/app.js')));

    expect(verdict.status).toBe('failed');
    expect(verdict.report).toContain('not covered');
    expect(verdict.report).toContain('run-0');
    expect(verdict.report).toContain('unverifiable');
  });

  it('gives no cover for an earlier run whose secret is gone', async () => {
    const verdict = await createG1Gate(
      deps({ own: chain([]), earlier: { 'run-0': earlierEdits() } }, { 'run-0': null }),
    ).run(ctx(claimed('src/app.js')));

    expect(verdict.status).toBe('failed');
    expect(verdict.report).toContain('README.md');
    expect(verdict.report).toContain('run-0');
  });

  it('still fails a changed file that no run of the ticket has a receipt for', async () => {
    const earlier = chain([edit('e1', 'README.md'), edit('e2', 'src/app.js')]);

    const verdict = await createG1Gate(
      deps({ own: chain([]), earlier: { 'run-0': earlier } }),
    ).run(ctx(claimed('src/app.js')));

    expect(verdict.status).toBe('failed');
    expect(verdict.report).toContain('src/todos.js');
    expect(verdict.report).not.toMatch(/not covered[^\n]*README\.md/);
  });

  it('still needs a claim for a file this run edited itself', async () => {
    const own = chain([edit('o1', 'src/todos.js')]);

    const verdict = await createG1Gate(
      deps({ own, earlier: { 'run-0': earlierEdits() } }),
    ).run(ctx(claimed('src/app.js')));

    expect(verdict.status).toBe('failed');
    expect(verdict.report).toMatch(/not covered[^\n]*src\/todos\.js/);
  });

  it('still needs this run own receipt for ran_tests', async () => {
    const earlier = chain([
      ...FILES.map((f, i) => edit(`e${i}`, f)),
      { id: 's1', tool: 'shell', resource: 'pnpm test' },
    ]);

    const verdict = await createG1Gate(
      deps({ own: chain([]), earlier: { 'run-0': earlier } }),
    ).run(ctx([{ kind: 'ran_tests' }, ...claimed('src/app.js')]));

    expect(verdict.status).toBe('failed');
    expect(verdict.findings.map((f) => f.claim?.kind)).toContain('ran_tests');
  });
});
