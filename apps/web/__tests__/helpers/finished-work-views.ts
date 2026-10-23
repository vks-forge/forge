/**
 * Fixtures for the two escalation kinds of finished work: a held decision and a sign-off.
 *
 * Why: the Full lane ends in questions only the owner may answer: "a check found problems, merge
 *   anyway?" and "will you sign this off?". Their shapes (findings with file and line, the rework
 *   count, the unplanned files, the tier and the checks) and their action tables follow the S5c-A
 *   contract in docs/briefs/s5c-full-lane.md, so a drift between the contract and the UI fails a
 *   test here. The views go through `escalationWorld()` like every other kind.
 *
 * Exports: decisionView(), signOffView(), FINDINGS, DECISION_ACTIONS, SIGN_OFF_ACTIONS.
 * Depends on: nothing (plain data).
 */

type Raw = Record<string, unknown>;

const at = (minutesAgo: number): string =>
  new Date(Date.now() - minutesAgo * 60_000).toISOString();

export const FINDINGS = [
  {
    severity: 'low',
    file: 'src/report.ts',
    line: 9,
    issue: 'A variable name shadows an import.',
    evidence: 'const window = ... on line 9 hides the import above it.',
  },
  {
    severity: 'high',
    file: 'src/window.ts',
    line: 41,
    issue: 'The window is computed in local time.',
    evidence: 'new Date(start) is read without a time zone on line 41.',
  },
] as const;

export const DECISION_ACTIONS: Readonly<Record<string, readonly string[]>> = {
  findings_hold: ['merge_anyway', 'rework', 'replan', 'cancel'],
  config_hold: ['merge_anyway', 'rework', 'replan', 'cancel'],
  provenance_hold: ['merge_anyway', 'rework', 'replan', 'cancel'],
  scope_drift: ['continue', 'replan', 'cancel'],
};

export const SIGN_OFF_ACTIONS = {
  A: ['approve', 'rework', 'cancel'],
  B: ['approve', 'rework', 'cancel'],
  C: ['sign_off', 'rework', 'cancel'],
} as const;

function base(over: Raw): Raw {
  return {
    ticket_id: 'SVC-4',
    ticket_title: 'Report window',
    card_id: 'FG-C9',
    stage: 'owner',
    status: 'pending',
    asked_at: at(20),
    escalated_at: at(18),
    ...over,
  };
}

export function decisionView(
  cause: 'findings_hold' | 'config_hold' | 'provenance_hold' | 'scope_drift',
  over: Raw = {},
): Raw {
  return base({
    id: `int-d-${cause}`,
    kind: 'decision',
    payload: {
      kind: 'decision',
      cause,
      summary:
        cause === 'findings_hold'
          ? 'The critic found 2 problems it will not send back again.'
          : cause === 'config_hold'
            ? 'The Worker changed files that control how its work is checked (tsconfig.json); review them, then Merge anyway or send it back.'
            : cause === 'provenance_hold'
              ? 'Forge cannot prove who changed src/cli.ts: the record of the earlier run that edited it is gone. Check the changes, then Merge anyway or send it back.'
              : 'The change touches 2 files the plan did not name.',
      stage_id: cause === 'scope_drift' ? 'check-plan' : 'critique',
      stage_label: cause === 'scope_drift' ? 'Check against the plan' : 'Critique',
      findings: cause === 'scope_drift' ? [] : FINDINGS,
      ...(cause === 'scope_drift'
        ? { unplanned: ['src/billing/invoice.ts', 'src/billing/tax.ts'] }
        : {}),
      rework: { count: cause === 'scope_drift' ? 0 : 2, cap: 2 },
    },
    actions: [...DECISION_ACTIONS[cause]!],
    ...over,
  });
}

export function signOffView(
  cause: 'tier_b' | 'tier_c' | 'owner_stage' | 'director_declined',
  over: Raw = {},
): Raw {
  const tier = cause === 'tier_c' ? 'C' : 'B';

  return base({
    id: `int-so-${cause}`,
    kind: 'sign_off',
    payload: {
      kind: 'sign_off',
      cause,
      tier,
      summary: 'Report window is finished and every check passed.',
      ...(cause === 'director_declined'
        ? {
            director_note:
              'One acceptance criterion could not be confirmed from the diff.',
          }
        : {}),
      checks: {
        passed: 3,
        counts: { critical: 0, high: 0, medium: 1, low: 0 },
        overrides: 1,
      },
    },
    actions: [...SIGN_OFF_ACTIONS[tier]],
    ...over,
  });
}
