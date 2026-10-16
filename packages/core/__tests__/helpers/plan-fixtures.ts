/**
 * Plan fixtures — a valid plan version and plan tickets to build tests from.
 *
 * Why: the floor, the diff and the plan schema all take a plan, and each test only cares
 *   about one field of it. One valid base with an override hook keeps every test short and
 *   keeps them honest: they start from a plan the schema accepts, so a failure is about the
 *   field under test.
 *
 * Exports: ticket(), plan().
 * Depends on: src/schemas/plan. No IO.
 */

import { PlanTicket, PlanVersion } from '#/schemas/plan.js';

/** A valid plan ticket; `over` replaces fields. */
export function ticket(key: string, over: Partial<PlanTicket> = {}): PlanTicket {
  return {
    key,
    title: `Ticket ${key}`,
    body: 'Do the thing.',
    acceptance: ['it works'],
    priority: 'normal',
    depends_on: [],
    lane: 'express',
    size: 'S',
    files: [`src/${key}.ts`],
    ...over,
  };
}

/** A valid plan version of card `SF-C1`; `over` replaces fields. */
export function plan(over: Partial<PlanVersion> = {}): PlanVersion {
  return PlanVersion.parse({
    card_id: 'SF-C1',
    version: 1,
    created_at: '2026-10-16T10:00:00.000Z',
    author: 'director',
    config_version: 0,
    base_sha: 'abc1234',
    goal: 'Ship a todo app',
    scope: ['list', 'add'],
    non_goals: ['sync'],
    decisions: [{ question: 'Storage?', answer: 'local' }],
    assumptions: ['single user'],
    verification: {
      blast_radius: 'small',
      files_read: ['package.json'],
      overlaps: [],
      matching_decisions: [],
      rejected_hits: [],
      risks: [],
    },
    tickets: [ticket('t1'), ticket('t2', { depends_on: ['t1'] })],
    card_links: [],
    enhance_report: '',
    ...over,
  });
}
