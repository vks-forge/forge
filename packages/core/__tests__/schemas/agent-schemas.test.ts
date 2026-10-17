/**
 * Pins the agent schemas and the places they touch: runs, compatibility reports, the config
 * documents and the draft step.
 *
 * Why: agents ride on existing rows (company and project settings, runs, the compat report) and
 *   those must keep parsing what was stored before agents existed, while accepting what agents
 *   add: a run request with no model (an agent on the harness default), a run that names its
 *   agent and hash, a report that carries the models of its build, settings with an `agents`
 *   section. The draft step's answer is untrusted model output and must be held to the same
 *   role bounds as a saved agent.
 *
 * Pins: AgentId shape; ModelChoice kinds; RunRequest without a model; Run agent fields; old
 *   reports without models; DraftAgentOutput accepts a valid draft and refuses a reviewer with
 *   a write tool; company and project overrides with agents merge and validate; mergeConfig
 *   refuses an agent with a broken role bound.
 * Depends on: src/schemas/*, src/domain/{builtin-config,merge-config}, vitest.
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_CONFIG } from '#/domain/builtin-config.js';
import { mergeConfig } from '#/domain/merge-config.js';
import { AgentId, HarnessModel, ModelChoice, ProjectAgents } from '#/schemas/agent.js';
import { CompatReport } from '#/schemas/harness-compat.js';
import { DraftAgentOutput } from '#/schemas/director-steps.js';
import { Run, RunRequest } from '#/schemas/run.js';
import { InvalidInputError } from '#/shared/errors.js';

const HASH = 'a'.repeat(64);

const REQUEST = {
  runId: 'r1',
  projectId: 'forge',
  lane: 'express',
  promptHash: HASH,
  mcpIdentity: 'forge',
  ticketId: 'FG-1',
  cwd: '/w',
  prompt: 'do it',
  budget: { maxTurns: 1, maxUsd: 1, stallMs: 1, turnMs: 1 },
  env: {},
  isolation: 'host',
};

const DRAFT = {
  definition: {
    name: 'API checker',
    description: 'Checks API changes.',
    role: 'reviewer',
    instructions: 'Look for breaking changes.',
    runs_on: {
      harness: 'project_default',
      model: { kind: 'harness_default' },
      fallbacks: [],
    },
    tools: ['read', 'grep'],
    write_scope: [],
    inputs: ['diff'],
    output: ['findings'],
    skills: [],
    memory: { tags: [], include_rejected: false },
    budget: { usd: 1 },
  },
  rationale: 'Read-only because it only judges.',
  questions: ['Which APIs count as public?'],
};

describe('ids and model choices', () => {
  it('accepts slugs of 2 to 48 characters and refuses the rest', () => {
    for (const ok of ['implementer', 'a1', 'test-writer', `a${'b'.repeat(47)}`]) {
      expect(AgentId.safeParse(ok).success, ok).toBe(true);
    }

    for (const bad of ['a', '1ab', 'Upper', 'with space', `a${'b'.repeat(48)}`]) {
      expect(AgentId.safeParse(bad).success, bad).toBe(false);
    }
  });

  it('knows the three model choices and refuses an unnamed or oversized custom id', () => {
    expect(ModelChoice.safeParse({ kind: 'forge_default' }).success).toBe(true);
    expect(ModelChoice.safeParse({ kind: 'harness_default' }).success).toBe(true);
    expect(ModelChoice.safeParse({ kind: 'model', id: 'my-model' }).success).toBe(true);
    expect(ModelChoice.safeParse({ kind: 'model', id: '' }).success).toBe(false);
    expect(ModelChoice.safeParse({ kind: 'model', id: 'x'.repeat(121) }).success).toBe(
      false,
    );
  });

  it('parses a harness model with its roles', () => {
    expect(
      HarnessModel.safeParse({
        id: 'opus',
        label: 'Opus',
        speed: 'deep',
        cost: 'high',
        recommended_for: ['reviewer'],
      }).success,
    ).toBe(true);
  });
});

describe('runs and reports', () => {
  it('parses a run request with no model, and with one', () => {
    expect(RunRequest.safeParse(REQUEST).success).toBe(true);
    expect(RunRequest.safeParse({ ...REQUEST, model: 'sonnet' }).success).toBe(true);
    expect(RunRequest.safeParse({ ...REQUEST, model: '' }).success).toBe(false);
  });

  it('lets a run name its agent and the hash, and reads older runs without them', () => {
    const base = {
      id: 'r1',
      ticket_id: 'FG-1',
      harness: 'claude-code',
      driver_version: '1',
      cwd: '/w',
      lane: 'express',
      started_at: '2026-10-17T10:00:00.000Z',
      status: 'running',
      owner: 'o',
    };

    expect(Run.parse(base).agent_id).toBeUndefined();
    expect(
      Run.parse({ ...base, agent_id: 'implementer', agent_hash: HASH }),
    ).toMatchObject({
      agent_id: 'implementer',
      agent_hash: HASH,
    });

    expect(Run.safeParse({ ...base, agent_hash: 'short' }).success).toBe(false);
  });

  it('reads a report written before models existed and one that carries them', () => {
    const report = {
      kind: 'claude',
      version: '2.1.299',
      started_at: '2026-10-17T10:00:00.000Z',
      finished_at: '2026-10-17T10:01:00.000Z',
      passed: true,
      summary: 'ok',
      checks: [],
      tools: [],
    };

    expect(CompatReport.parse(report).models).toBeUndefined();
    expect(
      CompatReport.parse({
        ...report,
        models: [
          { id: 'm', label: 'M', speed: 'fast', cost: 'low', recommended_for: [] },
        ],
      }).models,
    ).toHaveLength(1);
  });
});

describe('DraftAgentOutput', () => {
  it('accepts a valid draft', () => {
    expect(DraftAgentOutput.safeParse(DRAFT).success).toBe(true);
  });

  it('refuses a draft whose reviewer holds a write tool, naming the tool', () => {
    const bad = {
      ...DRAFT,
      definition: { ...DRAFT.definition, tools: ['read', 'edit'] },
    };

    const parsed = DraftAgentOutput.safeParse(bad);

    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain('edit');
  });

  it('allows at most three questions and a rationale of at most 1000 characters', () => {
    expect(
      DraftAgentOutput.safeParse({ ...DRAFT, questions: ['a', 'b', 'c', 'd'] }).success,
    ).toBe(false);

    expect(
      DraftAgentOutput.safeParse({ ...DRAFT, rationale: 'x'.repeat(1001) }).success,
    ).toBe(false);
  });
});

describe('agents in the config documents', () => {
  // Documents arrive as untyped JSON; `never` lets these cases hand over literals as they would be stored.
  const custom = { ...DRAFT.definition, origin: 'custom', archived: false } as never;

  it('merges a company agent and a builtin edit into the effective forge config', () => {
    const merged = mergeConfig(BUILTIN_CONFIG, {
      agents: { 'api-checker': custom, reviewer: { instructions: 'Terse.' } },
    });

    expect(Object.keys(merged.forge.agents)).toEqual(
      expect.arrayContaining([
        'implementer',
        'test-writer',
        'reviewer',
        'critic',
        'api-checker',
      ]),
    );

    expect(merged.forge.agents['reviewer']?.instructions).toBe('Terse.');
    expect(merged.forge.agents['reviewer']?.name).toBe('Reviewer');
  });

  it('refuses a company agent that breaks a role bound, as an invalid override', () => {
    const broken = { ...(custom as object), tools: ['read', 'shell'] } as never;

    expect(() =>
      mergeConfig(BUILTIN_CONFIG, { agents: { 'api-checker': broken } }),
    ).toThrow(InvalidInputError);
  });

  it('refuses the Forge default model on any agent but the implementer', () => {
    const wrong = {
      ...(custom as object),
      runs_on: {
        harness: 'project_default',
        model: { kind: 'forge_default' },
        fallbacks: [],
      },
    } as never;

    expect(() =>
      mergeConfig(BUILTIN_CONFIG, { agents: { 'api-checker': wrong } }),
    ).toThrow(InvalidInputError);
  });

  it('keeps a project override, a disabled agent and a project agent in the effective settings', () => {
    const merged = mergeConfig(
      BUILTIN_CONFIG,
      {},
      {
        agents: {
          custom: { mine: custom },
          overrides: { reviewer: { instructions: 'Local.' } },
          disabled: ['critic'],
        },
      },
    );

    expect(merged.project.agents?.custom['mine']?.name).toBe('API checker');
    expect(merged.project.agents?.overrides['reviewer']?.instructions).toBe('Local.');
    expect(merged.project.agents?.disabled).toEqual(['critic']);
  });

  it('refuses a project override that names a field projects may not override', () => {
    expect(() =>
      mergeConfig(BUILTIN_CONFIG, {}, {
        agents: { overrides: { reviewer: { tools: ['read'] } } },
      } as never),
    ).toThrow(InvalidInputError);
  });

  it('defaults an empty ProjectAgents to nothing custom, no overrides and nothing disabled', () => {
    expect(ProjectAgents.parse({})).toEqual({ custom: {}, overrides: {}, disabled: [] });
  });
});
