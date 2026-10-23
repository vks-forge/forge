/**
 * Mechanical stop: whether a stop is a setup, lockfile or generated-file problem.
 *
 * Why: when a ticket stops because an install failed, a lockfile is out of step or a
 *   generated file was edited by hand, the code is not wrong and the plan is not wrong: a Worker
 *   sent back to fix it is enough. The owner reaching for Re-plan there would throw away a
 *   plan for a problem rework cures, so the Re-plan confirmation names the cheaper way. This
 *   reads the stop's own words (findings, summary, diagnosis) and says so only when every
 *   finding of a hold is mechanical; one real finding means the owner must decide.
 *
 * Exports: mechanicalStop().
 * Depends on: schemas/action-consequences, schemas/escalation. No IO.
 */

import type { MechanicalStop } from '#/schemas/action-consequences.js';
import type { EscalationPayload } from '#/schemas/escalation.js';

const LOCKFILE =
  /(pnpm-lock|package-lock|yarn\.lock|poetry\.lock|cargo\.lock|go\.sum|lock ?file|frozen-lockfile)/i;

const GENERATED = /(auto-?generated|generated file|codegen|do not edit|\.generated\.)/i;
const INSTALL = /(install|ERR_PNPM|npm ERR|setup step)/i;

function kindOf(text: string): MechanicalStop['kind'] | null {
  if (LOCKFILE.test(text)) {
    return 'lockfile';
  }

  if (GENERATED.test(text)) {
    return 'generated';
  }

  return INSTALL.test(text) ? 'setup' : null;
}

/** The mechanical kind of a stop, or null when a person has to decide. */
export function mechanicalStop(payload: EscalationPayload): MechanicalStop | null {
  if (payload.kind === 'setup') {
    return payload.cause.type === 'worktree_setup' ? { kind: 'setup' } : null;
  }

  if (payload.kind === 'failure') {
    const kind = kindOf(`${payload.summary} ${payload.diagnosis ?? ''}`);

    return kind === null ? null : { kind };
  }

  if (payload.kind !== 'decision' || payload.cause === 'scope_drift') {
    return null;
  }

  if (payload.findings.length === 0) {
    return null;
  }

  const kinds = payload.findings.map((f) =>
    kindOf(`${f.file ?? ''} ${f.issue} ${f.evidence}`),
  );

  const first = kinds[0];

  return first !== null && first !== undefined && kinds.every((k) => k !== null)
    ? { kind: first }
    : null;
}
