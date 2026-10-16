/**
 * Fixtures for the card planning contract: a card, a plan version, a grill state, the flow.
 *
 * Why: the contract needs one valid example of each stored shape, and keeping them here keeps
 *   the contract file about behaviour. Every fixture is a complete, schema-valid value, so a
 *   test that expects a refusal changes one field on purpose.
 *
 * Exports: id(), at(), card(), plan(), grill(), FLOW.
 * Depends on: @forge/core, helpers/fixtures.
 */

import { BUILTIN_DIRECTOR_CONFIG } from '@forge/core';
import type { Card, CardId, GrillState, PlanVersion } from '@forge/core';
import { T0 } from '#tests/helpers/fixtures.js';

export const id = (n: number) => `SF-C${n}` as CardId;
export const at = (minute: number) =>
  `2026-10-13T00:${String(minute).padStart(2, '0')}:00.000Z`;

export const card = (n: number): Card => ({
  id: id(n),
  project: 'SF',
  type: 'issue',
  title: `Card ${n}`,
  summary: 'summary',
  source: { kind: 'chat', ref: `msg-${n}` },
  created_by: { type: 'user', id: 'u1' },
  created_at: T0,
  updated_at: T0,
  phase: 'grilling',
  phase_version: 0,
  needs_you: false,
  priority: 'normal',
  links: [],
});

export const plan = (
  n: number,
  version: number,
  over: Partial<PlanVersion> = {},
): PlanVersion => ({
  card_id: id(n),
  version,
  created_at: at(version),
  author: 'director',
  config_version: 3,
  base_sha: 'abc123',
  goal: `Goal v${version}`,
  scope: ['a'],
  non_goals: [],
  decisions: [{ question: 'q', answer: 'a' }],
  assumptions: [],
  verification: {
    blast_radius: 'small',
    files_read: ['src/a.ts'],
    overlaps: [],
    matching_decisions: [],
    rejected_hits: [],
    risks: [],
  },
  tickets: [
    {
      key: 't1',
      title: 'First',
      body: 'do it',
      acceptance: ['works'],
      priority: 'normal',
      depends_on: [],
      lane: 'express',
      size: 'S',
      files: ['src/a.ts'],
    },
  ],
  card_links: [],
  enhance_report: '',
  ...over,
});

export const grill = (over: Partial<GrillState> = {}): GrillState => ({
  current: null,
  queued: [],
  answers: [{ question_id: 'q1', question: 'Which?', answer: 'A', by: 'owner' }],
  asked: 1,
  round_asked: 1,
  rounds: 1,
  round_open: false,
  open_points: 2,
  assumptions: ['uses sqlite'],
  done: false,
  done_reason: null,
  survey: null,
  verify: null,
  enhance_report: '',
  step_summaries: [],
  step_decisions: {},
  predicted_lane: null,
  files_read: [],
  base_sha: null,
  pending_changes: null,
  floor: null,
  director_spend_usd: 0.25,
  ...over,
});

export const FLOW = BUILTIN_DIRECTOR_CONFIG.flow;
