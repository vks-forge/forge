/**
 * The Director's research limits as field descriptors.
 *
 * Why: how much a card may research (rounds, searches, pages read, bytes, runs per card, a
 *   per-call budget, whether it may look something up mid-grill) is an owner dial, because
 *   research costs money and reaches the web. Each limit gets a label, a hint with its range
 *   (the server's), and the unit the owner thinks in (KB for bytes). The per-call budget is
 *   optional: an empty box means "use the Director step cap", not "enter a number". Kept
 *   apart from the other Director fields so that file stays one screen of data.
 *
 * Exports: RESEARCH_LIMIT_FIELDS.
 * Depends on: types/settings-fields.types. Pure data.
 */

import type { FieldSpec } from '#/types/settings-fields.types.js';

export const RESEARCH_LIMIT_FIELDS: readonly FieldSpec[] = [
  {
    kind: 'number',
    path: 'director.research.max_rounds',
    label: 'Research rounds',
    hint: 'From 1 to 3. Each round may search and read pages, then writes down what it found.',
  },
  {
    kind: 'number',
    path: 'director.research.max_searches',
    label: 'Searches per run',
    hint: 'From 0 to 20.',
  },
  {
    kind: 'number',
    path: 'director.research.max_fetches',
    label: 'Pages read per run',
    hint: 'From 0 to 20.',
  },
  {
    kind: 'number',
    path: 'director.research.max_bytes',
    label: 'Page text per run',
    unit: 'KB',
    scale: 1000,
    hint: 'From 50 to 2000 KB. Reading stops at this total.',
  },
  {
    kind: 'number',
    path: 'director.research.max_runs_per_card',
    label: 'Research runs per card',
    hint: 'From 1 to 10. Past this a card goes on without more research.',
  },
  {
    kind: 'number',
    path: 'director.research.step_budget_usd',
    label: 'Budget for one research call',
    unit: 'USD',
    step: 0.1,
    optional: true,
    hint: 'Leave empty to use the Per Director step cap in Limits.',
  },
  {
    kind: 'switch',
    path: 'director.research.grill_detours',
    label: 'Research during the grill',
    hint: 'When on, the Director may look something up between two questions instead of asking you.',
  },
];
