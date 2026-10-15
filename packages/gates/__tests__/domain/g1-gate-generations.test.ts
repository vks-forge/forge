/**
 * G1 across a resume: each secret generation of the receipt chain is verified with its own secret.
 *
 * Why: a run resumed after a server restart (d-0092) has a chain in segments, one per run secret
 *   generation (d-0100). G1 must fetch every generation's secret, verify each segment and the
 *   links, and never pass a chain it could not fully verify: if a generation's secret is gone the
 *   gate fails (the ticket goes to rework) instead of passing on part of the evidence. If G1 only
 *   looked at the latest generation, the receipts written before the restart would be unchecked.
 *
 * Pins: a two-generation run with both secrets passes and its report names the generations;
 *   a run whose first-generation secret is gone fails with a finding that names the generation.
 * Depends on: adapters/g1-gate-factory, helpers/fixtures.
 */

import { describe, expect, it } from 'vitest';
import { createG1Gate } from '#/adapters/g1-gate-factory.js';
import type { G1Deps } from '#/types/g1-deps.types.js';
import {
  SECRET,
  checksOf,
  context,
  diffOf,
  generationsChain,
  patchFor,
  receiptLog,
} from '#tests/helpers/fixtures.js';

const SECOND = 'second-generation-secret-0123456789abcdef';
const EDIT = { id: 'c1', tool: 'edit', resource: 'src/a.ts' };
const TEST = { id: 'c2', tool: 'shell', resource: 'pnpm test' };

function deps(over: Partial<G1Deps> = {}): G1Deps {
  return {
    receipts: receiptLog(
      generationsChain([
        { calls: [EDIT], secret: SECRET },
        { calls: [TEST], secret: SECOND },
      ]),
    ),
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
    runSecrets: () => Promise.resolve(null),
    env: {},
    runCommand: () => Promise.resolve({ exitCode: 0, timedOut: false, output: '' }),
    now: () => new Date('2026-01-01T00:00:00Z'),
    ...over,
  };
}

describe('G1 across a resume', () => {
  it('verifies a run that resumed after a restart, each segment with its own generation secret', async () => {
    const secrets = new Map([
      [1, SECRET],
      [2, SECOND],
    ]);

    const verdict = await createG1Gate(
      deps({
        runSecrets: (_run, generation) =>
          Promise.resolve(secrets.get(generation) ?? null),
      }),
    ).run(
      context({
        claims: [{ kind: 'edited', path: 'src/a.ts' }],
        checks: checksOf({ lint: 'pnpm lint', test: 'pnpm test' }),
        generation: 2,
      }),
    );

    expect(verdict.status).toBe('passed');
    expect(verdict.report).toContain('2 generation(s)');
  });

  it('fails a resumed run whose first-generation secret is gone', async () => {
    const verdict = await createG1Gate(
      deps({
        runSecrets: (_run, generation) =>
          Promise.resolve(generation === 2 ? SECOND : null),
      }),
    ).run(context({ generation: 2 }));

    expect(verdict.status).toBe('failed');
    expect(verdict.findings[0]?.message).toContain('generation 1 is gone');
  });
});
