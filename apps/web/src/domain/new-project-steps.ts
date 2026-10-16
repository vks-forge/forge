/**
 * The steps of "add a project" and which form fields belong to which step.
 *
 * Why: the add-project dialog asks for one thing at a time, so each step must know which
 *   fields it owns: Next is disabled only by that step's own problems (a bad prefix must not
 *   block the Folder step), and a refusal from the server for a field on an earlier step must
 *   send the person back to that step instead of leaving the message on a screen that does not
 *   show the field. Pure functions, no IO.
 *
 * Exports: PROJECT_STEPS, stepOfField(), problemsForStep(), projectStepIndex(), adjacentStep().
 * Depends on: types/onboarding.types. No IO.
 */

import type { ProjectField, ProjectStepId } from '#/types/onboarding.types.js';

export const PROJECT_STEPS: readonly { id: ProjectStepId; label: string }[] = [
  { id: 'folder', label: 'Folder' },
  { id: 'git', label: 'Git' },
  { id: 'details', label: 'Details' },
  { id: 'checks', label: 'Checks' },
  { id: 'review', label: 'Review' },
];

const FIELD_STEP: Readonly<Record<ProjectField, ProjectStepId>> = {
  local_path: 'folder',
  connection: 'git',
  repo: 'git',
  installation_id: 'git',
  slug: 'details',
  prefix: 'details',
  base_branch: 'details',
  form: 'details',
  checks: 'checks',
};

/** The step whose screen shows `field`. */
export function stepOfField(field: ProjectField): ProjectStepId {
  return FIELD_STEP[field];
}

/** The problems a step owns; the review step owns them all. */
export function problemsForStep(
  step: ProjectStepId,
  problems: Partial<Record<ProjectField, string>>,
): Partial<Record<ProjectField, string>> {
  if (step === 'review') {
    return problems;
  }

  return Object.fromEntries(
    Object.entries(problems).filter(
      ([field]) => FIELD_STEP[field as ProjectField] === step,
    ),
  );
}

export function projectStepIndex(id: ProjectStepId): number {
  return PROJECT_STEPS.findIndex((s) => s.id === id);
}

/** The step before (`-1`) or after (`1`) `id`, or `id` itself at either end. */
export function adjacentStep(id: ProjectStepId, by: -1 | 1): ProjectStepId {
  return PROJECT_STEPS[projectStepIndex(id) + by]?.id ?? id;
}
