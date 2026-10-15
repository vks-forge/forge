/**
 * How a run's status reads: its label, tone and the filter groups of the Runs screen.
 *
 * Why: a run's persisted status alone cannot say "waiting for the quota to reset": that is the
 *   server's `paused_harness` flag on a live run. The reader needs one word and one tone per
 *   situation (working, parked, done, failed), and needs them to agree between the table, the
 *   drawer and the ticket strip. Failure statuses are grouped so "show me what went wrong" is
 *   one click, not six checkboxes. Tone is never carried by colour alone: each tone also has
 *   its own word.
 *
 * Exports: runStatusView(), RUN_FILTERS, isLive(), ACTIVE_RUN_STATUSES.
 * Depends on: @forge/core (RunStatus, RunSummary types). Pure.
 */

import type { RunStatus, RunSummary } from '@forge/core';
import type { RunFilterKey, RunTone } from '#/types/work-ui.types.js';

const LOOK: Readonly<Record<RunStatus, { label: string; tone: RunTone }>> = {
  starting: { label: 'Starting', tone: 'working' },
  running: { label: 'Running', tone: 'working' },
  settling: { label: 'Settling', tone: 'working' },
  settled: { label: 'Settled', tone: 'good' },
  success: { label: 'Succeeded', tone: 'good' },
  refused: { label: 'Refused', tone: 'bad' },
  max_turns: { label: 'Hit turn limit', tone: 'bad' },
  timeout: { label: 'Timed out', tone: 'bad' },
  error: { label: 'Failed', tone: 'bad' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  interrupted: { label: 'Interrupted', tone: 'parked' },
};

/** Statuses of a run that is still doing something. */
export const ACTIVE_RUN_STATUSES: readonly RunStatus[] = [
  'starting',
  'running',
  'settling',
];

export function isLive(run: Pick<RunSummary, 'status'>): boolean {
  return ACTIVE_RUN_STATUSES.includes(run.status);
}

export function runStatusView(run: Pick<RunSummary, 'status' | 'paused_harness'>): {
  label: string;
  tone: RunTone;
} {
  return run.paused_harness
    ? { label: 'Parked: quota', tone: 'parked' }
    : LOOK[run.status];
}

export const RUN_FILTERS: readonly {
  key: RunFilterKey;
  label: string;
  statuses: readonly RunStatus[] | undefined;
}[] = [
  { key: 'all', label: 'All', statuses: undefined },
  { key: 'active', label: 'Active', statuses: ACTIVE_RUN_STATUSES },
  { key: 'done', label: 'Done', statuses: ['success', 'settled'] },
  {
    key: 'problems',
    label: 'Problems',
    statuses: ['refused', 'max_turns', 'timeout', 'error', 'interrupted'],
  },
];
