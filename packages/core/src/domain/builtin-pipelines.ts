/**
 * Built-in pipelines — the three lane pipelines a fresh install ships.
 *
 * Why: the lane decides how much process a ticket gets (d-0006). Express keeps today's
 *   behaviour exactly (one implementer, G1, merge), so turning pipelines on changes nothing for
 *   small work. Standard adds what a medium change deserves: the failing tests first, then the
 *   implementation, G1, and an independent reviewer who has not seen the Worker's own story.
 *   Full adds a critic beside the reviewer and a human look before merge (d-0137). These are
 *   code merged at read, so a better default reaches every install that never edited a lane,
 *   and an owner's edit replaces the whole lane list. They carry no `description`, because a
 *   shipped note would survive a settings merge into an owner's replacement.
 *
 * Exports: BUILTIN_PIPELINES.
 * Depends on: schemas/pipeline. No IO.
 */

import type { LanePipelines, Stage } from '#/schemas/pipeline.js';

const IMPLEMENT: Stage = {
  id: 'implementer',
  kind: 'agent',
  label: 'Implement',
  agent: 'implementer',
};

const TESTS: Stage = {
  id: 'test-writer',
  kind: 'agent',
  label: 'Write failing tests',
  agent: 'test-writer',
  proof: 'red',
};

const G1: Stage = {
  id: 'g1',
  kind: 'script_gate',
  label: 'Gate G1',
  run: { builtin: 'g1' },
};

const MERGE: Stage = { id: 'merge', kind: 'merge', label: 'Merge', locked: true };

const REVIEW: Stage = {
  id: 'reviewer',
  kind: 'agent',
  label: 'Review',
  agent: 'reviewer',
};

export const BUILTIN_PIPELINES: LanePipelines = {
  express: { stages: [IMPLEMENT, G1, MERGE] },
  standard: { stages: [TESTS, IMPLEMENT, G1, REVIEW, MERGE] },
  full: {
    stages: [
      TESTS,
      IMPLEMENT,
      G1,
      {
        id: 'review-group',
        kind: 'group',
        label: 'Review and critique',
        join: 'all',
        members: [
          { id: 'review', kind: 'agent', label: 'Review', agent: 'reviewer' },
          { id: 'critique', kind: 'agent', label: 'Critique', agent: 'critic' },
        ],
      },
      {
        id: 'human',
        kind: 'human',
        label: 'Your sign-off',
        prompt:
          'Look at the finished change and approve it, or send it back with a comment.',
      },
      MERGE,
    ],
  },
};
