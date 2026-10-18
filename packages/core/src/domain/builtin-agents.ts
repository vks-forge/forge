/**
 * Built-in agents — the four agents a fresh install ships.
 *
 * Why: owners should not have to write the common roles before the first ticket, and the
 *   engine must have an agent to run every lane with. The implementer is defined so a run
 *   request is identical to the one the engine built before agents existed (project harness,
 *   the lane matrix model, no extra instructions, the lane's tools, the whole worktree, the
 *   company run budget): turning agents on changes nothing until the owner edits one. The
 *   test-writer, reviewer and critic carry real instructions and read-only or test-only
 *   bounds; they are run by lane pipelines (d-0137). Builtins are code merged at read, so a
 *   release can improve their text for everyone who has not edited it.
 *
 * Exports: BUILTIN_AGENTS, BUILTIN_AGENT_IDS, IMPLEMENTER_ID.
 * Depends on: domain/builtin-agent-texts/*, schemas/agent. No IO.
 */

import { CRITIC_INSTRUCTIONS } from '#/domain/builtin-agent-texts/critic.js';
import { REVIEWER_INSTRUCTIONS } from '#/domain/builtin-agent-texts/reviewer.js';
import { TEST_WRITER_INSTRUCTIONS } from '#/domain/builtin-agent-texts/test-writer.js';
import type { AgentDefinition } from '#/schemas/agent.js';

/** The agent every lane runs until pipelines can name another writer. */
export const IMPLEMENTER_ID = 'implementer';

const WHOLE_SLICE = { tags: [], include_rejected: true };
const READ_TOOLS = [
  'read',
  'grep',
  'glob',
  'mcp__forge__docs_lookup',
  'mcp__forge__memory_search',
  'mcp__forge__memory_get',
  'mcp__forge__memory_related',
  'mcp__forge__add_comment',
  'mcp__forge__ask_director',
  'mcp__forge__submit_review',
];

function reviewer(
  name: string,
  description: string,
  instructions: string,
): AgentDefinition {
  return {
    name,
    description,
    role: 'reviewer',
    instructions,
    runs_on: {
      harness: 'project_default',
      model: { kind: 'model', id: 'opus' },
      fallbacks: [],
    },
    tools: [...READ_TOOLS],
    write_scope: [],
    inputs: ['ticket', 'diff', 'test_report', 'gate_report'],
    output: ['findings'],
    skills: [],
    memory: { ...WHOLE_SLICE },
    budget: {},
    archived: false,
    origin: 'builtin',
  };
}

export const BUILTIN_AGENTS: Readonly<Record<string, AgentDefinition>> = {
  [IMPLEMENTER_ID]: {
    name: 'Implementer',
    description:
      "Writes the ticket's change in its own worktree and finishes with typed claims for every edit.",
    role: 'writer',
    instructions: '',
    runs_on: {
      harness: 'project_default',
      model: { kind: 'forge_default' },
      fallbacks: [],
    },
    tools: 'lane_default',
    write_scope: ['**'],
    inputs: ['plan', 'ticket'],
    output: ['diff', 'finish_claims'],
    skills: [],
    memory: { ...WHOLE_SLICE },
    budget: {},
    archived: false,
    origin: 'builtin',
  },
  'test-writer': {
    name: 'Test writer',
    description:
      'Writes the failing tests that prove a ticket is done, before the fix, and touches test files only.',
    role: 'tester',
    instructions: TEST_WRITER_INSTRUCTIONS,
    runs_on: {
      harness: 'project_default',
      model: { kind: 'model', id: 'sonnet' },
      fallbacks: [],
    },
    tools: 'lane_default',
    write_scope: [
      '**/__tests__/**',
      '**/*.test.*',
      '**/*.spec.*',
      '**/tests/**',
      '**/test/**',
    ],
    inputs: ['plan', 'ticket'],
    output: ['diff', 'test_report'],
    skills: [],
    memory: { ...WHOLE_SLICE },
    budget: {},
    archived: false,
    origin: 'builtin',
  },
  reviewer: reviewer(
    'Reviewer',
    'Reads the diff against the ticket and reports findings with severity, place and evidence. Cannot edit.',
    REVIEWER_INSTRUCTIONS,
  ),
  critic: reviewer(
    'Critic',
    "Argues against the change and its approach; should run on a different model family from the Worker's. Cannot edit.",
    CRITIC_INSTRUCTIONS,
  ),
};

/** The ids of the shipped agents, in the order they are listed. */
export const BUILTIN_AGENT_IDS: readonly string[] = Object.keys(BUILTIN_AGENTS);
