/**
 * Pins the agent role bounds: what each role may and may not be given.
 *
 * Why: a reviewer that can edit, run a shell or hold a write scope is not an independent
 *   reviewer, and a writer with no scope has no defined limits. The bounds must hold for every
 *   combination of role and tool, however the definition was made, so this property test walks
 *   every role against every class of tool and asserts that no read-only definition with a
 *   write tool or a write scope validates, while read-only definitions without them always do.
 *
 * Pins: reviewer and researcher refuse write-class tools, `lane_default` and any write scope;
 *   writer and tester need a write scope; fallbacks must be distinct and at most five;
 *   forge_default only on the implementer; agentHash ignores key order.
 * Depends on: src/schemas/agent, src/domain/agent-rules, fast-check, vitest.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  agentHash,
  agentRuleIssues,
  forgeDefaultIssues,
  isWriteClassTool,
} from '#/domain/agent-rules.js';
import { AgentDefinition, AgentInput } from '#/schemas/agent.js';
import type { AgentRole } from '#/schemas/agent.js';

const READ_TOOLS = [
  'read',
  'grep',
  'glob',
  'mcp__forge__docs_lookup',
  'mcp__forge__finish',
];

const WRITE_TOOLS = ['edit', 'write', 'shell', 'task', 'mcp__github__create_issue'];

const RUNS_ON = {
  harness: 'project_default',
  model: { kind: 'harness_default' },
  fallbacks: [],
};

const make = (
  role: AgentRole,
  tools: 'lane_default' | string[],
  write_scope: string[],
  over: Record<string, unknown> = {},
): unknown => ({
  name: 'A',
  description: 'An agent.',
  role,
  instructions: '',
  runs_on: RUNS_ON,
  tools,
  write_scope,
  inputs: [],
  output: [],
  skills: [],
  memory: { tags: [], include_rejected: true },
  budget: {},
  ...over,
});

const ok = (def: unknown): boolean => AgentInput.safeParse(def).success;

describe('agent role bounds (property)', () => {
  const readOnly = fc.constantFrom<AgentRole>('reviewer', 'researcher');

  it('no reviewer or researcher with a write-class tool validates', () => {
    fc.assert(
      fc.property(
        readOnly,
        fc.subarray(READ_TOOLS),
        fc.subarray(WRITE_TOOLS, { minLength: 1 }),
        (role, reads, writes) => {
          expect(ok(make(role, [...reads, ...writes], []))).toBe(false);
        },
      ),
    );
  });

  it('no reviewer or researcher with a write scope validates', () => {
    fc.assert(
      fc.property(
        readOnly,
        fc.subarray(READ_TOOLS),
        fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 3 }),
        (role, reads, scope) => {
          expect(ok(make(role, reads, scope))).toBe(false);
        },
      ),
    );
  });

  it('a reviewer or researcher cannot follow the lane default tools, which include editing', () => {
    fc.assert(
      fc.property(readOnly, (role) => {
        expect(ok(make(role, 'lane_default', []))).toBe(false);
      }),
    );
  });

  it('a reviewer or researcher with only read tools and no scope always validates', () => {
    fc.assert(
      fc.property(readOnly, fc.subarray(READ_TOOLS), (role, reads) => {
        expect(ok(make(role, reads, []))).toBe(true);
      }),
    );
  });

  it('a writer or tester needs a write scope and then accepts any tools', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<AgentRole>('writer', 'tester'),
        fc.subarray([...READ_TOOLS, ...WRITE_TOOLS]),
        (role, tools) => {
          expect(ok(make(role, tools, []))).toBe(false);
          expect(ok(make(role, tools, ['src/**']))).toBe(true);
        },
      ),
    );
  });
});

describe('agent rules (cases)', () => {
  it('treats every project MCP tool as write-class and Forge tools as not', () => {
    expect(isWriteClassTool('mcp__github__anything')).toBe(true);
    expect(isWriteClassTool('mcp__forge__finish')).toBe(false);
    expect(isWriteClassTool('read')).toBe(false);
  });

  it('names the field and the reason in plain words', () => {
    const issues = agentRuleIssues({
      role: 'reviewer',
      tools: ['read', 'edit'],
      write_scope: ['src/**'],
      runs_on: { model: { kind: 'harness_default' }, fallbacks: [] },
    });

    expect(issues.map((i) => i.path[0])).toEqual(['tools', 'write_scope']);
    expect(issues[0]?.message).toContain('"edit"');
  });

  it('refuses two identical fallbacks', () => {
    const fb = { harness: 'claude-code', model: { kind: 'model', id: 'opus' } };
    const runs = { ...RUNS_ON, fallbacks: [fb, fb] };

    expect(ok(make('writer', 'lane_default', ['**'], { runs_on: runs }))).toBe(false);
  });

  it('allows at most five fallbacks', () => {
    const runs = (n: number): unknown => ({
      ...RUNS_ON,
      fallbacks: Array.from({ length: n }, (_, i) => ({
        harness: 'project_default',
        model: { kind: 'model', id: `m${i}` },
      })),
    });

    expect(ok(make('writer', 'lane_default', ['**'], { runs_on: runs(5) }))).toBe(true);
    expect(ok(make('writer', 'lane_default', ['**'], { runs_on: runs(6) }))).toBe(false);
  });

  it('allows forge_default only for the implementer', () => {
    const def = AgentDefinition.parse({
      ...(make('writer', 'lane_default', ['**']) as object),
      origin: 'custom',
      runs_on: { ...RUNS_ON, model: { kind: 'forge_default' } },
    });

    expect(forgeDefaultIssues('implementer', def)).toEqual([]);
    expect(forgeDefaultIssues('my-agent', def)).toHaveLength(1);
  });

  it('hashes the same definition the same whatever the key order', () => {
    const a = { name: 'x', role: 'writer', budget: { usd: 1, turns: 2 } };
    const b = { budget: { turns: 2, usd: 1 }, role: 'writer', name: 'x' };

    expect(agentHash(a)).toBe(agentHash(b));
    expect(agentHash(a)).not.toBe(agentHash({ ...a, name: 'y' }));
    expect(agentHash(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});
