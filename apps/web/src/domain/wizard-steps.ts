/**
 * The first-run wizard's steps and where it should open.
 *
 * Why: the wizard has three fixed steps (harnesses, GitHub, first project) and a
 *   person may leave and come back, so where it opens must come from what the server already
 *   knows, not from memory the browser may have lost. A harness that already passed its test
 *   means step 1 is done; otherwise the wizard opens at the beginning. A step the person was
 *   on in this visit wins, so Back and a reload within the visit do not jump around.
 *
 * Exports: WIZARD_STEPS, startStep(), stepIndex(), neighbour().
 * Depends on: @forge/core (SystemInfo, type), types/onboarding.types. No IO.
 */

import type { SystemInfo } from '@forge/core';
import type { WizardStepId } from '#/types/onboarding.types.js';

export const WIZARD_STEPS: readonly { id: WizardStepId; label: string }[] = [
  { id: 'harness', label: 'Harnesses and logins' },
  { id: 'github', label: 'GitHub' },
  { id: 'project', label: 'First project' },
];

export function stepIndex(id: WizardStepId): number {
  return WIZARD_STEPS.findIndex((s) => s.id === id);
}

/** The step before (`-1`) or after (`1`) `id`, or `id` itself at either end. */
export function neighbour(id: WizardStepId, by: -1 | 1): WizardStepId {
  return WIZARD_STEPS[stepIndex(id) + by]?.id ?? id;
}

/** The step to open: the one chosen this visit, else the first one the server says is not done. */
export function startStep(
  system: Pick<SystemInfo, 'first_run'>,
  chosen: WizardStepId | null,
): WizardStepId {
  if (chosen !== null) {
    return chosen;
  }

  return system.first_run.harness_ok ? 'github' : 'harness';
}
