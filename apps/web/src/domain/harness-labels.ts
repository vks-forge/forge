/**
 * Human names for harnesses and their sign-in methods.
 *
 * Why: the registry id (`claude`) is a key, not a name. Owners look for "Claude Code", and
 *   the list row, the page header and the test result must all say the same words for how a
 *   harness signs in, or the same fact reads differently on three screens.
 *
 *   A harness's health has two separate truths, and the rows say both. "Last run" is what the
 *   newest finished Worker run on it did (the server's `last_run`): after fifty good runs the
 *   harness is plainly working, whether or not anyone pressed the test button. "Live test" is the
 *   button's own result. A harness never reads "Not tested yet" while runs prove it works; the
 *   line then says "live test not run".
 *
 * Exports: harnessName(), MODE_WORDS, harnessHealth(), lastRunWords(), liveTestWords().
 * Depends on: domain/relative-time, schemas/settings (type). Pure.
 */

import { shortTime, timeAgo } from '#/domain/relative-time.js';
import type { HarnessView } from '#/schemas/settings.js';

const NAMES: Readonly<Record<string, string>> = {
  claude: 'Claude Code',
};

/** The product name for a harness id, or the id itself when Forge has no better name. */
export function harnessName(id: string): string {
  return NAMES[id] ?? id;
}

export const MODE_WORDS = {
  login: 'Signed-in account',
  api_key: 'API key',
  oauth_token: 'OAuth token',
} as const;

/** The pill a harness shows: paused and failing checks first, then a good last run, then a passed live test. */
export function harnessHealth(harness: HarnessView): {
  tone: 'good' | 'attn' | 'bad' | 'quiet';
  label: string;
} {
  if (harness.status === 'paused') {
    return { tone: 'attn', label: 'Paused' };
  }

  if (harness.status === 'error') {
    return { tone: 'bad', label: 'Needs attention' };
  }

  if (harness.status === 'ok' || harness.last_run?.status === 'success') {
    return { tone: 'good', label: 'Working' };
  }

  if (harness.last_run !== undefined) {
    return { tone: 'attn', label: 'Last run did not finish well' };
  }

  return { tone: 'quiet', label: 'Not tested yet' };
}

/** "last run 07:12 (2.1.304)", or null when no Worker has used this harness lately. */
export function lastRunWords(harness: HarnessView): string | null {
  const run = harness.last_run;

  if (run === undefined) {
    return null;
  }

  const version =
    run.version === undefined || run.version === '' ? '' : ` (${run.version})`;

  const outcome = run.status === 'success' ? '' : ' ended badly';

  return `last run${outcome} ${shortTime(run.at)}${version}`;
}

/** "live test passed 3 d ago (2.1.304)" or "live test not run": the test button's own result. */
export function liveTestWords(harness: HarnessView, now = Date.now()): string {
  if (harness.last_checked_at === undefined) {
    return 'live test not run';
  }

  const version = harness.version === undefined ? '' : ` (${harness.version})`;

  return `live test ${harness.status === 'error' ? 'failed' : 'passed'} ${timeAgo(harness.last_checked_at, now)}${version}`;
}
