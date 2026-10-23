/**
 * Pins: a stop is mechanical only when it is a failed setup, or a failure or hold whose own words
 * (every finding, for a hold) say install, lockfile or generated file; one real finding, a scope
 * drift or a question is never mechanical.
 *
 * Why: the Re-plan confirmation points a mechanical stop to Send back for rework instead. Calling a
 *   real problem mechanical would steer the owner away from the re-plan it needs.
 * Depends on: src/domain/mechanical-stop. Pure.
 */

import { describe, expect, it } from 'vitest';
import { mechanicalStop } from '#/domain/mechanical-stop.js';
import type { EscalationPayload } from '#/schemas/escalation.js';

const decision = (
  findings: { file?: string; issue: string; evidence: string }[],
  cause: 'findings_hold' | 'scope_drift' = 'findings_hold',
): EscalationPayload => ({
  kind: 'decision',
  cause,
  summary: 's',
  stage_id: 'critique',
  stage_label: 'Critique',
  findings: findings.map((f) => ({ severity: 'high' as const, ...f })),
  rework: { count: 0, cap: 2 },
});

describe('mechanicalStop', () => {
  it('reads a failed worktree setup as setup', () => {
    expect(
      mechanicalStop({
        kind: 'setup',
        cause: { type: 'worktree_setup' } as never,
        summary: 'x',
        fix_href: '/x',
      }),
    ).toEqual({ kind: 'setup' });
  });

  it('reads a hold whose findings all concern the lockfile or a generated file', () => {
    expect(
      mechanicalStop(
        decision([{ file: 'pnpm-lock.yaml', issue: 'changed', evidence: 'out of step' }]),
      ),
    ).toEqual({ kind: 'lockfile' });

    expect(
      mechanicalStop(
        decision([{ issue: 'edited by hand', evidence: 'auto-generated file header' }]),
      ),
    ).toEqual({ kind: 'generated' });
  });

  it('does not call a hold mechanical when one finding is real, or for scope drift', () => {
    expect(
      mechanicalStop(
        decision([
          { file: 'pnpm-lock.yaml', issue: 'changed', evidence: 'lockfile' },
          { file: 'src/a.ts', issue: 'wrong time zone', evidence: 'read without zone' },
        ]),
      ),
    ).toBeNull();

    expect(mechanicalStop(decision([], 'scope_drift'))).toBeNull();
  });

  it('reads a failure whose words name an install problem, and not a question', () => {
    expect(
      mechanicalStop({
        kind: 'failure',
        cause: 'retry_cap',
        summary: 'pnpm install failed twice',
        attempts: [],
      }),
    ).toEqual({ kind: 'setup' });

    expect(
      mechanicalStop({ kind: 'question', text: 'which?', source: 'legacy', options: [] }),
    ).toBeNull();
  });
});
