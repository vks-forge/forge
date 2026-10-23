/**
 * The Director's pace limit as a field descriptor.
 *
 * Why: the Director can work on several cards and tickets at once (planning turns, chat answers,
 *   triage, replies to a running Worker). More at once is faster, but every step is a model call on
 *   the owner's plan, so the owner decides how many. The label and hint use the owner's words
 *   ("cards or tickets at the same time"), not the setting's name. Kept apart from the other
 *   Director fields so that file stays one screen of data.
 *
 * Exports: PACE_FIELDS.
 * Depends on: types/settings-fields.types. Pure data.
 */

import type { FieldSpec } from '#/types/settings-fields.types.js';

export const PACE_FIELDS: readonly FieldSpec[] = [
  {
    kind: 'number',
    path: 'director.max_concurrent_steps',
    label: 'Cards and tickets at the same time',
    hint: 'From 1 to 8. How many cards or tickets the Director works on at the same time. More is faster but uses your plan’s limits sooner.',
  },
];
