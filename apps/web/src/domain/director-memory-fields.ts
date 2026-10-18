/**
 * The Director's memory-retrieval settings as field descriptors.
 *
 * Why: project memory grows past what fits in a prompt, so the Director pastes the pinned
 *   decisions plus the few most relevant ones instead of all of them, and may spend one cheap
 *   model call turning a card's question into search words. How many it pastes and whether
 *   it spends that call are owner dials, because both trade cost against what the Director
 *   remembers. Each hint carries the server's range. Rejected approaches are never ranked
 *   away: the Director always sees all of them (up to the cap), which the page says outright
 *   because an owner would otherwise fear that a low "relevant decisions" number hides a
 *   ruled-out approach. Kept apart from the other Director fields so that file stays one
 *   screen of data.
 *
 * Exports: MEMORY_RETRIEVAL_FIELDS, MEMORY_REJECTED_NOTE.
 * Depends on: types/settings-fields.types. Pure data.
 */

import type { FieldSpec } from '#/types/settings-fields.types.js';

export const MEMORY_REJECTED_NOTE =
  'Rejected approaches are always all listed to the Director, up to the cap below, and are never ranked away by the other numbers.';

export const MEMORY_RETRIEVAL_FIELDS: readonly FieldSpec[] = [
  {
    kind: 'switch',
    path: 'director.memory.rewrite',
    label: 'Rewrite a question into search words',
    hint: 'One quick model call when planning a card or chatting on one. When off, or when the call fails, plain keywords from the question are used.',
  },
  {
    kind: 'number',
    path: 'director.memory.rewrite_timeout_ms',
    label: 'Rewrite may run up to',
    unit: 's',
    scale: 1000,
    hint: 'From 1 to 60 seconds. After that the keywords are used.',
  },
  {
    kind: 'number',
    path: 'director.memory.rewrite_budget_usd',
    label: 'Budget for one rewrite',
    unit: 'USD',
    step: 0.05,
    hint: 'From 0 to 2. Over this the rewrite is skipped and keywords are used.',
  },
  {
    kind: 'number',
    path: 'director.memory.top_k',
    label: 'Relevant decisions per step',
    hint: 'From 1 to 15. The most relevant active decisions added to the pinned ones.',
  },
  {
    kind: 'number',
    path: 'director.memory.pinned_max',
    label: 'Pinned decisions per step',
    hint: 'From 0 to 25. Pinned decisions are always included, newest first.',
  },
  {
    kind: 'number',
    path: 'director.memory.rejected_max',
    label: 'Rejected approaches listed',
    hint: 'From 5 to 50. All of them are listed up to this many; past it the most relevant are kept.',
  },
];
