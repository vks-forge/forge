/**
 * Pins the shipped agents, the template gallery and the memory filter.
 *
 * Why: the four built-ins and six templates are data the product ships; if any of them failed
 *   its own schema the first settings load would refuse to start, and a template that let a
 *   reviewer write would break the read-only promise. The implementer must be defined exactly
 *   as the parity rule says, since the Express run request is built from it. The memory filter
 *   may only ever show less than the whole slice.
 *
 * Pins: builtins and templates validate; builtin ids and roles; implementer parity values;
 *   templates are not part of the roster and have real instructions; filterMemorySlice.
 * Depends on: src/domain/{builtin-agents,agent-templates,agent-memory}, src/schemas/agent, vitest.
 */

import { describe, expect, it } from 'vitest';
import { filterMemorySlice } from '#/domain/agent-memory.js';
import { AGENT_TEMPLATES } from '#/domain/agent-templates.js';
import { BUILTIN_AGENTS, BUILTIN_AGENT_IDS } from '#/domain/builtin-agents.js';
import { AgentDefinition, AgentInput, AgentsRecord } from '#/schemas/agent.js';

describe('built-in agents', () => {
  it('ships implementer, test-writer, reviewer and critic, and all validate', () => {
    expect(BUILTIN_AGENT_IDS).toEqual([
      'implementer',
      'test-writer',
      'reviewer',
      'critic',
    ]);

    expect(AgentsRecord.safeParse(BUILTIN_AGENTS).success).toBe(true);

    for (const def of Object.values(BUILTIN_AGENTS)) {
      expect(def.origin).toBe('builtin');
      expect(def.archived).toBe(false);
    }
  });

  it('defines the implementer so the Express run request is unchanged', () => {
    expect(BUILTIN_AGENTS['implementer']).toMatchObject({
      role: 'writer',
      instructions: '',
      tools: 'lane_default',
      write_scope: ['**'],
      budget: {},
      runs_on: {
        harness: 'project_default',
        model: { kind: 'forge_default' },
        fallbacks: [],
      },
    });
  });

  it('keeps reviewer and critic read-only, and the test-writer to test paths', () => {
    for (const id of ['reviewer', 'critic']) {
      const def = BUILTIN_AGENTS[id] as AgentDefinition;

      expect(def.role).toBe('reviewer');
      expect(def.write_scope).toEqual([]);
      expect(def.tools).not.toContain('edit');
      expect(def.tools).not.toContain('shell');
      expect(def.instructions.split('\n').length).toBeGreaterThan(25);
    }

    const tester = BUILTIN_AGENTS['test-writer'] as AgentDefinition;

    expect(tester.role).toBe('tester');
    expect(tester.write_scope.length).toBeGreaterThan(0);
    expect(tester.write_scope).not.toContain('**');
    expect(tester.instructions.split('\n').length).toBeGreaterThan(25);
  });

  it('refuses forge_default on any agent but the implementer', () => {
    const bad = {
      ...BUILTIN_AGENTS,
      reviewer: {
        ...(BUILTIN_AGENTS['reviewer'] as AgentDefinition),
        runs_on: {
          harness: 'project_default',
          model: { kind: 'forge_default' },
          fallbacks: [],
        },
      },
    };

    expect(AgentsRecord.safeParse(bad).success).toBe(false);
  });
});

describe('agent templates', () => {
  it('ships the six gallery agents, each valid, with real instructions and no origin', () => {
    expect(AGENT_TEMPLATES.map((t) => t.id)).toEqual([
      'security-reviewer',
      'docs-writer',
      'network-config-reviewer',
      'accessibility-reviewer',
      'performance-reviewer',
      'migration-reviewer',
    ]);

    for (const t of AGENT_TEMPLATES) {
      expect(AgentInput.safeParse(t.definition).success, t.id).toBe(true);
      expect(t.definition.instructions.split('\n').length, t.id).toBeGreaterThan(20);
      expect(t.definition.runs_on.model, t.id).toEqual({ kind: 'model', id: 'sonnet' });
      expect(Object.keys(t.definition), t.id).not.toContain('origin');
    }
  });

  it('is not part of the roster the engine reads', () => {
    for (const t of AGENT_TEMPLATES) {
      expect(BUILTIN_AGENT_IDS).not.toContain(t.id);
    }
  });

  it('gives every reviewer template read tools and no write scope', () => {
    for (const t of AGENT_TEMPLATES.filter((x) => x.definition.role === 'reviewer')) {
      expect(t.definition.write_scope, t.id).toEqual([]);
      expect(t.definition.tools, t.id).not.toBe('lane_default');
    }
  });
});

describe('filterMemorySlice', () => {
  const slice = {
    decisions: [
      { id: 'd-1', statement: 'a', tags: ['db'] },
      { id: 'd-2', statement: 'b', tags: ['ui'] },
      { id: 'd-3', statement: 'c' },
    ],
    rejected: [{ id: 'r-1', statement: 'x', tags: ['db'] }],
  };

  it('shows the whole slice for an empty tag list', () => {
    expect(filterMemorySlice(slice, { tags: [], include_rejected: true })).toEqual(slice);
  });

  it('keeps only records carrying one of the tags and hides untagged ones', () => {
    const out = filterMemorySlice(slice, { tags: ['db'], include_rejected: true });

    expect(out.decisions.map((r) => r.id)).toEqual(['d-1']);
    expect(out.rejected.map((r) => r.id)).toEqual(['r-1']);
  });

  it('hides rejected approaches unless asked for', () => {
    expect(
      filterMemorySlice(slice, { tags: [], include_rejected: false }).rejected,
    ).toEqual([]);
  });
});
