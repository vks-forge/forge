/**
 * describeWait — the plain-language line for why a ticket has not started.
 *
 * Why: a ticket that sits in Planned for an hour looks broken unless the page says what it
 *   is waiting for. The real causes are a blocker that is not done, a card that is being
 *   re-planned, a harness parked until its quota resets, and a limit on how many Workers may
 *   run at once, and a worktree whose packages are being installed. The
 *   scheduler already knows which one applies; this turns that structured reason into the
 *   short text the ticket page shows ("quota: claude-code until 14:20 UTC", "cap:
 *   per-project 1/1", "deps: PAY-231"), so the words never drift from the decision.
 *
 * Exports: describeWait(), clockUtc().
 * Depends on: types/pick-next. No IO.
 */

import type { WaitReason } from '#/types/pick-next.types.js';

/** `HH:MM UTC` of an epoch-ms time. */
export const clockUtc = (ms: number): string =>
  `${new Date(ms).toISOString().slice(11, 16)} UTC`;

const SCOPE_LABEL = {
  global: 'global',
  project: 'per-project',
  harness: 'per-harness',
  state: 'in_progress',
} as const;

/** `m:ss` of a duration. */
const elapsed = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));

  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/** The wait reason as the line the API returns. */
export function describeWait(wait: WaitReason): string {
  switch (wait.kind) {
    case 'deps':
      return `deps: ${wait.ids.join(', ')}`;
    case 'plan':
      return 'plan: the card is being re-planned';
    case 'prep':
      return wait.step === ''
        ? `Getting the workspace ready (${elapsed(wait.elapsedMs)})`
        : `Getting the workspace ready: ${wait.step} (${elapsed(wait.elapsedMs)})`;
    case 'quota':
      return `quota: ${wait.harness} until ${clockUtc(wait.until)}`;
    case 'cap':
      return `cap: ${SCOPE_LABEL[wait.scope]} ${wait.used}/${wait.limit}`;
  }
}
