/**
 * Run status in words and tone.
 *
 * Why: a run's persisted status ("settling", "max_turns") is engine vocabulary. The Board and
 *   Ticket page say what it means to a person ("Wrapping up", "Hit the turn limit") and give
 *   it one of four tones, so a failed run and a running one never look alike. Tone is never
 *   the only signal: every status keeps its words.
 *
 * Exports: RUN_STATUS_LABEL, runTone(), isRunLive().
 * Depends on: @forge/core (RunStatus type), types/ticket-view.types. No IO.
 */

import type { RunStatus } from '@forge/core';
import type { RunTone } from '#/types/ticket-view.types.js';

export const RUN_STATUS_LABEL: Readonly<Record<RunStatus, string>> = {
  starting: 'Starting',
  running: 'Running',
  settling: 'Wrapping up',
  settled: 'Settled',
  success: 'Succeeded',
  refused: 'Refused',
  max_turns: 'Hit the turn limit',
  timeout: 'Timed out',
  error: 'Failed',
  cancelled: 'Cancelled',
  interrupted: 'Interrupted',
};

const TONE: Readonly<Record<RunStatus, RunTone>> = {
  starting: 'live',
  running: 'live',
  settling: 'live',
  settled: 'quiet',
  success: 'good',
  refused: 'bad',
  max_turns: 'bad',
  timeout: 'bad',
  error: 'bad',
  cancelled: 'quiet',
  interrupted: 'bad',
};

export function runTone(status: RunStatus): RunTone {
  return TONE[status];
}

/** True while a Worker may still be producing events. */
export function isRunLive(status: RunStatus): boolean {
  return TONE[status] === 'live';
}
