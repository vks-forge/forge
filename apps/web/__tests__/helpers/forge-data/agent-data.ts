/**
 * Test data for the agent screens: a ready harness with models, a tool catalogue, the Director's
 * sample draft.
 *
 * Why: the agent editor builds its pickers from what the server reports (a harness, its models and
 *   their recommended roles, the tool catalogue), and the draft flow needs one complete,
 *   valid agent to prefill from. Keeping them as named samples means a test says "the harness
 *   is paused" by changing one field, and the wording the tests look for does not move when the
 *   real driver's model list does.
 *
 * Exports: SAMPLE_HARNESS, TOOL_IDS, DRAFT_REPLY, AGENT_PROJECT_VERSION, COMPANY_START_VERSION.
 * Depends on: @forge/core (types).
 */

import type { RunsOnHarness } from '@forge/core';

/** The version a project starts at (the project-settings sample has three saved versions). */
export const AGENT_PROJECT_VERSION = 3;

export const COMPANY_START_VERSION = 2;

export const SAMPLE_HARNESS: RunsOnHarness = {
  id: 'claude-code',
  kind: 'claude',
  version: '2.1.142',
  signed_in: true,
  compat: 'pass',
  ready: true,
  reasons: [],
  fix_href: '/settings/harnesses/claude',
  models: [
    {
      id: 'opus',
      label: 'Opus',
      speed: 'deep',
      cost: 'high',
      recommended_for: ['reviewer', 'researcher'],
    },
    {
      id: 'sonnet',
      label: 'Sonnet',
      speed: 'balanced',
      cost: 'medium',
      recommended_for: ['writer', 'tester'],
    },
    { id: 'haiku', label: 'Haiku', speed: 'fast', cost: 'low', recommended_for: [] },
  ],
};

export const TOOL_IDS: readonly (readonly [string, string])[] = [
  ['read', 'read'],
  ['glob', 'read'],
  ['grep', 'read'],
  ['edit', 'write-cwd'],
  ['write', 'write-cwd'],
  ['shell', 'exec'],
  ['mcp__forge__docs_lookup', 'read'],
  ['mcp__forge__add_comment', 'write-cwd'],
];

/** What `POST /agents/draft` answers: a valid read-only reviewer with a rationale and one question. */
export const DRAFT_REPLY = {
  definition: {
    name: 'Migration checker',
    description: 'Reviews database migrations for data loss and missing rollbacks.',
    role: 'reviewer',
    instructions: '# Migration checker\n\nRead every migration in the diff.',
    runs_on: {
      harness: 'project_default',
      model: { kind: 'model', id: 'opus' },
      fallbacks: [],
    },
    tools: ['read', 'grep', 'glob'],
    write_scope: [],
    inputs: ['diff'],
    output: ['findings'],
    skills: [],
    memory: { tags: [], include_rejected: false },
    budget: {},
  },
  rationale: 'A reviewer fits: it only needs to read the diff and report.',
  questions: ['Which migration tool does the project use?'],
};
