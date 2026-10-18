/**
 * Builders for the scorecard suites: tickets, pipeline copies, stage rows, runs, findings and the whole input.
 *
 * Why: the scorecard arithmetic is tested from several angles (writers, checks and findings, shapes, windows, slices).
 *   They must all build tickets, snapshots and rows the same way, so a drift in one suite's idea of "a passed
 *   implementer row" or "a run that cost nothing recorded" cannot hide a bug in another's.
 *
 * Exports: DAY, NOW, iso, HASH, HASH2, ticket, snapshot, row, run, finding, input, agentRow.
 * Depends on: src/domain/scorecards, src/schemas/{finding,run,stage-run}, src/types/scorecard-input, helpers/adjust-fixtures. No IO.
 */

import type { computeScorecards } from '#/domain/scorecards.js';
import type { Finding } from '#/schemas/finding.js';
import type { Run } from '#/schemas/run.js';
import type { StageRun } from '#/schemas/stage-run.js';
import type {
  ScorecardInput,
  ScorecardSnapshot,
  ScorecardTicket,
} from '#/types/scorecard-input.types.js';
import { roster } from '#tests/helpers/adjust-fixtures.js';

export const DAY = 86_400_000;
export const NOW = Date.parse('2026-10-18T12:00:00.000Z');
export const iso = (msAgo: number): string => new Date(NOW - msAgo).toISOString();
export const HASH = 'c'.repeat(64);
export const HASH2 = 'd'.repeat(64);

export const ticket = (
  n: number,
  over: Partial<ScorecardTicket> = {},
): ScorecardTicket => ({
  id: `FOR-${n}` as ScorecardTicket['id'],
  type: 'feat',
  lane: 'standard',
  tier_predicted: 'A',
  status: 'done',
  rework_count: 0,
  created_at: iso(5 * DAY),
  updated_at: iso(DAY),
  ...over,
});

export const snapshot = (
  n: number,
  over: Partial<ScorecardSnapshot> = {},
): ScorecardSnapshot => ({
  ticket_id: `FOR-${n}` as ScorecardSnapshot['ticket_id'],
  lane: 'standard',
  definition: {
    stages: [
      { id: 'implementer', kind: 'agent', label: 'Implement', agent: 'implementer' },
      { id: 'g1', kind: 'script_gate', label: 'G1', run: { builtin: 'g1' } },
      { id: 'reviewer', kind: 'agent', label: 'Review', agent: 'reviewer' },
      { id: 'merge', kind: 'merge', label: 'Merge', locked: true },
    ],
  },
  roles: { implementer: 'writer', reviewer: 'reviewer' },
  hash: HASH,
  base_hash: HASH,
  adjustments: [],
  ...over,
});

let rowId = 0;

export const row = (
  n: number,
  stage: string,
  agent: string,
  over: Partial<StageRun> = {},
): StageRun => ({
  id: ++rowId,
  ticket_id: `FOR-${n}` as StageRun['ticket_id'],
  stage_id: stage,
  member_id: '',
  cycle: 0,
  kind: 'agent',
  agent_id: agent,
  status: 'passed',
  outcome: {},
  started_at: iso(2 * DAY),
  ended_at: iso(2 * DAY - 60_000),
  ...over,
});

let runN = 0;

export const run = (n: number, agent: string, over: Partial<Run> = {}): Run => ({
  id: `r${++runN}`,
  ticket_id: `FOR-${n}`,
  harness: 'claude-code',
  driver_version: '1',
  cwd: '/x',
  lane: 'standard',
  started_at: iso(2 * DAY),
  ended_at: iso(2 * DAY - 120_000),
  status: 'success',
  owner: 'o',
  agent_id: agent,
  ...over,
});

export const finding = (severity: Finding['severity'], issue: string): Finding => ({
  severity,
  issue,
  evidence: 'seen in the diff',
});

export const input = (over: Partial<ScorecardInput> = {}): ScorecardInput => ({
  now: NOW,
  range: '90d',
  tickets: [],
  snapshots: [],
  rows: [],
  runs: [],
  marks: [],
  roster,
  ...over,
});

export const agentRow = (
  reply: ReturnType<typeof computeScorecards>,
  id: string,
  by = 'all',
  value?: string,
) =>
  reply.agents
    .find((a) => a.agent_id === id)
    ?.rows.find((r) => r.by === by && r.value === value);
