/**
 * The sample tickets of the mock adapter, as plain seed rows.
 *
 * Why: the Board needs a ticket in every column and the Ticket page needs the interesting
 *   cases (a question waiting, a live run, a failed gate, a rework). These are plainly
 *   samples about an imaginary service; `ticket-fixtures.ts` expands them into full rows
 *   validated by core's schemas.
 *
 * Exports: SEEDS, ago().
 * Depends on: types/mock.types.
 */

import type { TicketSeed } from '#tests/helpers/fake-tickets/types.js';

const NOW = Date.now();

/** An ISO timestamp `minutes` in the past. */
export const ago = (minutes: number): string =>
  new Date(NOW - minutes * 60_000).toISOString();

export const SEEDS: readonly TicketSeed[] = [
  {
    id: 'SVC-1',
    project: 'fixture-1',
    title: 'Retry webhook sends with backoff',
    status: 'done',
    lane: 'express',
    updated: 1500,
    pr: 41,
    run: { id: 'run-svc-1', status: 'success', cost: 0.31 },
  },
  {
    id: 'SVC-2',
    project: 'fixture-1',
    title: 'Rename config key retries to maxRetries',
    status: 'done',
    lane: 'express',
    updated: 900,
    pr: 44,
    run: { id: 'run-svc-2', status: 'success', cost: 0.12 },
  },
  {
    id: 'SVC-3',
    project: 'fixture-1',
    title: 'Stream large CSV exports instead of buffering',
    status: 'in_progress',
    lane: 'standard',
    updated: 2,
    run: { id: 'run-svc-3', status: 'running', harness: 'claude-code' },
  },
  {
    id: 'SVC-4',
    project: 'fixture-1',
    title: 'Fix off-by-one in the nightly report window',
    status: 'waiting_human',
    lane: 'standard',
    updated: 12,
    run: { id: 'run-svc-4', status: 'settled', cost: 0.48 },
  },
  {
    id: 'SVC-5',
    project: 'fixture-1',
    title: 'Move sessions to a composite primary key',
    status: 'review',
    lane: 'full',
    updated: 45,
    pr: 47,
    run: { id: 'run-svc-5', status: 'success', cost: 1.9 },
  },
  {
    id: 'SVC-6',
    project: 'fixture-1',
    title: 'Document the public rate limits',
    status: 'planned',
    lane: 'express',
    updated: 30,
  },
  {
    id: 'SVC-7',
    project: 'fixture-1',
    title: 'Spike: replace the logger',
    status: 'inbox',
    lane: 'express',
    updated: 6,
  },
  {
    id: 'SVC-8',
    project: 'fixture-1',
    title: 'Reject oversized uploads before reading the body',
    status: 'verifying',
    lane: 'standard',
    updated: 20,
    rework: 1,
    pr: 48,
    run: { id: 'run-svc-8', status: 'settling' },
  },
  {
    id: 'SVC-9',
    project: 'fixture-1',
    title: 'Remove the v1 endpoints',
    status: 'blocked',
    lane: 'full',
    updated: 200,
    blocked: 'Waits for SVC-5 to merge',
  },
  {
    id: 'SVC-10',
    project: 'fixture-1',
    title: 'Try an in-memory cache layer',
    status: 'cancelled',
    lane: 'standard',
    updated: 3000,
  },
  {
    id: 'SVC-11',
    project: 'fixture-1',
    title: 'Rotate the signing key',
    status: 'needs_signoff',
    lane: 'full',
    updated: 75,
    pr: 49,
    run: { id: 'run-svc-11', status: 'success', cost: 2.4 },
  },
  {
    id: 'WEB-1',
    project: 'fixture-2',
    title: 'Add a dark mode toggle to the header',
    status: 'in_progress',
    lane: 'standard',
    updated: 9,
    run: { id: 'run-web-1', status: 'running', harness: 'claude-code' },
  },
  {
    id: 'WEB-2',
    project: 'fixture-2',
    title: 'Fix the cropped logo on small screens',
    status: 'planned',
    lane: 'express',
    updated: 40,
  },
];
