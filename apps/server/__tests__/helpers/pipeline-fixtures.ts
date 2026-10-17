/**
 * Pipeline fixtures for the route tests: stage builders and the invalid lists the save door must refuse.
 *
 * Why: every pipeline route test needs a handful of valid stage lists and one broken list per
 *   safety rule (merge missing, G1 missing, an agent checking its own work, ...). Building them
 *   once keeps each test a short story about what the server answers, and keeps the broken lists
 *   in one place so the "nothing is stored" assertion covers every rule the brief names.
 *
 * Exports: agent(), g1(), merge(), STANDARD_LIKE, INVALID_LISTS, send().
 * Depends on: helpers/agent-rig. No IO.
 */

import { WHO } from '#tests/helpers/agent-rig.js';

type Stage = Record<string, unknown>;

export const agent = (id: string, agentId: string, extra: Stage = {}): Stage => ({
  id,
  kind: 'agent',
  label: id,
  agent: agentId,
  ...extra,
});

export const g1 = (): Stage => ({
  id: 'g1',
  kind: 'script_gate',
  label: 'Gate G1',
  run: { builtin: 'g1' },
});

export const merge = (): Stage => ({
  id: 'merge',
  kind: 'merge',
  label: 'Merge',
  locked: true,
});

/** A valid Standard variant: implementer, G1, reviewer, merge (no test-writer). */
export const STANDARD_LIKE = {
  stages: [
    agent('implementer', 'implementer'),
    g1(),
    agent('reviewer', 'reviewer'),
    merge(),
  ],
};

/** One broken list per rule the brief names, with the code the store must answer. */
export const INVALID_LISTS: readonly { code: string; stages: Stage[] }[] = [
  { code: 'merge_missing', stages: [agent('implementer', 'implementer'), g1()] },
  { code: 'g1_missing', stages: [agent('implementer', 'implementer'), merge()] },
  {
    code: 'rework_target',
    stages: [
      agent('implementer', 'implementer'),
      g1(),
      agent('reviewer', 'reviewer', { rework_to: 'g1' }),
      merge(),
    ],
  },
  {
    code: 'self_review',
    stages: [
      agent('implementer', 'implementer'),
      g1(),
      agent('second', 'implementer'),
      merge(),
    ],
  },
  {
    code: 'writer_after_check',
    stages: [
      agent('implementer', 'implementer'),
      agent('reviewer', 'reviewer'),
      agent('tests', 'test-writer'),
      g1(),
      merge(),
    ],
  },
  {
    code: 'unknown_agent',
    stages: [
      agent('implementer', 'implementer'),
      g1(),
      agent('ghost', 'ghost-agent'),
      merge(),
    ],
  },
  {
    code: 'group_writer',
    stages: [
      agent('implementer', 'implementer'),
      g1(),
      {
        id: 'grp',
        kind: 'group',
        label: 'Group',
        join: 'all',
        members: [agent('m1', 'reviewer'), agent('m2', 'test-writer')],
      },
      merge(),
    ],
  },
];

/** The body of a write: the version the editor saw, a reason and extra fields. */
export const send = (
  expected_version: number,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({ expected_version, ...WHO, ...extra });
