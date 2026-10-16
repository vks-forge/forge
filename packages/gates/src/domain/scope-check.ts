/**
 * Scope check — a diff outside the project's folder fails the gate.
 *
 * Why: a project can be a subfolder of a larger repository (d-0124). The Worker's tool
 *   floor keeps it inside that folder, but the gate must not rely on the Worker's account
 *   or on the floor alone: the real diff is the proof. The worktree manager reports every
 *   path relative to the project folder, so a change outside it appears as `../x`; any such
 *   path means the ticket touched code the user never put in this project, and it must not
 *   merge. A project that is a whole repository never produces such a path.
 *
 * Exports: checkScope().
 * Depends on: @forge/core (WorktreeDiff), types/check. No IO.
 */

import type { GateFinding, WorktreeDiff } from '@forge/core';
import type { CheckOutcome } from '#/types/check.types.js';

const OUTSIDE = /^\.\.(\/|$)/;

/** Fails on every changed (or renamed-from) path that leaves the project folder. */
export function checkScope(diff: WorktreeDiff): CheckOutcome {
  const outside = diff.files.flatMap((f) =>
    [f.path, ...(f.oldPath === undefined ? [] : [f.oldPath])].filter((p) =>
      OUTSIDE.test(p.replaceAll('\\', '/')),
    ),
  );

  const findings: GateFinding[] = [...new Set(outside)].sort().map((p) => ({
    check: 'scope',
    message: `${p}: changed outside the project folder; this project only covers its own folder`,
  }));

  return {
    name: 'scope',
    status: findings.length === 0 ? 'passed' : 'failed',
    findings,
    details:
      findings.length === 0
        ? 'Every changed file is inside the project folder.'
        : findings.map((f) => `- ${f.message}`).join('\n'),
  };
}
