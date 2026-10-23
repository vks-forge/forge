/**
 * G1 gate configuration tests — pin how G1 treats gate configuration files the Worker adds.
 *
 * Why: a project created from an empty folder has no checks, and its scaffold ticket must be
 *   allowed to create `tsconfig.json`, `vitest.config.ts` and `eslint.config.mjs` (CHE-1 failed
 *   three times for it). Once checks exist the same files fail, and the verdict says the failure is
 *   gate configuration only so the engine can hand it to the owner instead of reworking it. Any
 *   other failing or erroring check must keep the verdict from claiming that (d-0173).
 *
 * Pins: first run with the scaffold files and no checks passes with the allowance in the report;
 *   with checks it fails config-only; another failing check or a check that could not run leaves
 *   the config-only marker off.
 * Depends on: domain/g1-gate, helpers/fixtures.
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
  receiptLog,
} from '#tests/helpers/fixtures.js';

function deps(over: Partial<G1Deps> = {}): G1Deps {
  return {
    receipts: receiptLog(chain([])),
    worktrees: { diff: () => Promise.resolve(diffOf([])) },
    listToolCalls: () => Promise.resolve([]),
    runSecrets: () => Promise.resolve(SECRET),
    env: {},
    runCommand: () => Promise.resolve({ exitCode: 0, timedOut: false, output: '' }),
    now: () => new Date('2026-01-01T00:00:00Z'),
    ...over,
  };
}

describe('createG1Gate gate configuration (d-0173)', () => {
  const SCAFFOLD = ['tsconfig.json', 'vitest.config.ts', 'eslint.config.mjs'];
  const scaffoldDiff = () =>
    Promise.resolve(
      diffOf(
        SCAFFOLD.map((path) => ({ status: 'A' as const, path })),
        SCAFFOLD.map((path) => patchFor(path, ['{}'])).join(''),
      ),
    );

  const claims: Claim[] = SCAFFOLD.map((path) => ({ kind: 'edited', path }));
  const scaffoldDeps = () =>
    deps({
      worktrees: { diff: scaffoldDiff },
      receipts: receiptLog(
        chain(SCAFFOLD.map((resource, i) => ({ id: `w${i}`, tool: 'write', resource }))),
      ),
      listToolCalls: () =>
        Promise.resolve(SCAFFOLD.map((_, i) => ({ callId: `w${i}`, name: 'Write' }))),
    });

  it('passes a first run that adds the scaffold config files in a project with no checks (CHE-1)', async () => {
    const verdict = await createG1Gate(scaffoldDeps()).run(
      context({ claims, checks: checksOf({}) }),
    );

    expect(verdict.status).toBe('passed');
    expect(verdict.configOnly).toBeUndefined();
    expect(verdict.report).toContain('no project checks are configured yet');
  });

  it('fails config-only when checks exist, and says so on the verdict', async () => {
    const verdict = await createG1Gate(scaffoldDeps()).run(
      context({ claims, checks: checksOf({ test: 'pnpm test' }) }),
    );

    expect(verdict.status).toBe('failed');
    expect(verdict.configOnly).toBe(true);
    expect(verdict.findings.map((f) => f.file)).toEqual(SCAFFOLD);
  });

  it('is not config-only when another check also fails', async () => {
    const verdict = await createG1Gate(scaffoldDeps()).run(
      context({ claims: [], checks: checksOf({ test: 'pnpm test' }) }),
    );

    expect(verdict.status).toBe('failed');
    expect(verdict.findings.some((f) => f.check !== 'gate-config')).toBe(true);
    expect(verdict.configOnly).toBeUndefined();
  });

  it('is not config-only when a project check could not run', async () => {
    const verdict = await createG1Gate({
      ...scaffoldDeps(),
      runCommand: () => Promise.reject(new Error('spawn failed')),
    }).run(context({ claims, checks: checksOf({ test: 'pnpm test' }) }));

    expect(verdict.configOnly).toBeUndefined();
  });
});
