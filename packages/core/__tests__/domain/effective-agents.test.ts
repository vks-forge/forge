/**
 * Pins the agent roster a scope sees and the agent a pipeline stage gets.
 *
 * Why: screens and the engine must agree on which agents exist, which are switched off or
 *   archived, and what a project override adds up to. A disabled or archived agent that a stage
 *   still got would run work the owner turned off, and a stage whose agent is switched off must
 *   stop the ticket instead of running someone else.
 *
 * Pins: every tag combination (built-in, company, edited, overridden, project, disabled,
 *   archived), list order, override layering and `base`, hash follows the effective
 *   definition, readiness comes from the lookup, stageAgent skips disabled and archived agents
 *   and stands nothing in for them, and the shipped implementer is always available.
 * Depends on: src/domain/effective-agents, src/domain/builtin-agents, vitest.
 */

import { describe, expect, it } from 'vitest';
import { agentHash } from '#/domain/agent-rules.js';
import { BUILTIN_AGENTS } from '#/domain/builtin-agents.js';
import {
  effectiveAgents,
  shippedImplementer,
  stageAgent,
} from '#/domain/effective-agents.js';
import type { AgentDefinition, ProjectAgents } from '#/schemas/agent.js';

const ready = (): { ready: boolean; reasons: string[] } => ({ ready: true, reasons: [] });
const company = (): Record<string, AgentDefinition> => ({ ...BUILTIN_AGENTS });

const custom = (name: string, over: Partial<AgentDefinition> = {}): AgentDefinition => ({
  ...(BUILTIN_AGENTS['implementer'] as AgentDefinition),
  name,
  origin: 'custom',
  runs_on: {
    harness: 'project_default',
    model: { kind: 'harness_default' },
    fallbacks: [],
  },
  ...over,
});

const empty: ProjectAgents = { custom: {}, overrides: {}, disabled: [] };

describe('effectiveAgents, company scope', () => {
  it('lists the four built-ins first, in shipped order, tagged built-in', () => {
    const views = effectiveAgents(company(), undefined, ready);

    expect(views.map((v) => v.id)).toEqual([
      'implementer',
      'test-writer',
      'reviewer',
      'critic',
    ]);

    expect(views.every((v) => v.tags.length === 1 && v.tags[0] === 'builtin')).toBe(true);
    expect(views.every((v) => v.scope === 'company')).toBe(true);
  });

  it('tags a built-in the owner changed as overridden', () => {
    const agents = company();
    agents['reviewer'] = {
      ...(agents['reviewer'] as AgentDefinition),
      instructions: 'Be terse.',
    };

    const tags = effectiveAgents(agents, undefined, ready).find(
      (v) => v.id === 'reviewer',
    )?.tags;

    expect(tags).toEqual(['builtin', 'overridden']);
  });

  it('lists custom company agents after the built-ins, by name, tagged company', () => {
    const agents = { ...company(), zeta: custom('Zeta'), alpha: custom('Alpha') };

    const views = effectiveAgents(agents, undefined, ready);

    expect(views.map((v) => v.id).slice(4)).toEqual(['alpha', 'zeta']);
    expect(views.find((v) => v.id === 'alpha')?.tags).toEqual(['company']);
  });

  it('keeps an archived agent listed with the archived tag', () => {
    const agents = { ...company(), old: custom('Old', { archived: true }) };

    expect(
      effectiveAgents(agents, undefined, ready).find((v) => v.id === 'old')?.tags,
    ).toEqual(['company', 'archived']);
  });
});

describe('effectiveAgents, project scope', () => {
  it('lays a project override of instructions and runs_on over the company agent and keeps the base', () => {
    const runs = {
      harness: 'other',
      model: { kind: 'model' as const, id: 'haiku' },
      fallbacks: [],
    };

    const project: ProjectAgents = {
      ...empty,
      overrides: { reviewer: { instructions: 'Project rules.', runs_on: runs } },
    };

    const v = effectiveAgents(company(), project, ready).find((x) => x.id === 'reviewer');

    expect(v?.tags).toEqual(['builtin', 'overridden']);
    expect(v?.definition.instructions).toBe('Project rules.');
    expect(v?.definition.runs_on).toEqual(runs);
    expect(v?.definition.name).toBe('Reviewer');
    expect(v?.base).toEqual(BUILTIN_AGENTS['reviewer']);
    expect(v?.hash).toBe(agentHash(v?.definition));
  });

  it('keeps a company agent unchanged and without a base when the project has no override', () => {
    const v = effectiveAgents(company(), empty, ready).find((x) => x.id === 'critic');

    expect(v?.base).toBeUndefined();
    expect(v?.definition).toEqual(BUILTIN_AGENTS['critic']);
  });

  it('tags a company agent switched off here as disabled and keeps it listed', () => {
    const v = effectiveAgents(company(), { ...empty, disabled: ['critic'] }, ready).find(
      (x) => x.id === 'critic',
    );

    expect(v?.tags).toEqual(['builtin', 'disabled']);
  });

  it('adds project agents last, tagged project and scoped to the project', () => {
    const project: ProjectAgents = { ...empty, custom: { mine: custom('Mine') } };

    const views = effectiveAgents({ ...company(), co: custom('Co') }, project, ready);

    expect(views.map((v) => v.id)).toEqual([
      'implementer',
      'test-writer',
      'reviewer',
      'critic',
      'co',
      'mine',
    ]);

    expect(views.at(-1)).toMatchObject({ scope: 'project', tags: ['project'] });
  });

  it('combines overridden, disabled and archived on one agent', () => {
    const agents = { ...company(), co: custom('Co', { archived: true }) };
    const project: ProjectAgents = {
      ...empty,
      overrides: { co: { instructions: 'x' } },
      disabled: ['co'],
    };

    expect(
      effectiveAgents(agents, project, ready).find((v) => v.id === 'co')?.tags,
    ).toEqual(['company', 'overridden', 'disabled', 'archived']);
  });

  it('asks the lookup for the readiness of each effective runs_on', () => {
    const views = effectiveAgents(company(), empty, (runs) => ({
      ready: runs.model.kind !== 'forge_default',
      reasons: ['why'],
    }));

    expect(views.find((v) => v.id === 'implementer')?.readiness.ready).toBe(false);
    expect(views.find((v) => v.id === 'reviewer')?.readiness.ready).toBe(true);
  });
});

describe('stageAgent', () => {
  it('finds a usable agent by id', () => {
    const views = effectiveAgents(company(), empty, ready);

    expect(stageAgent(views, 'reviewer')?.id).toBe('reviewer');
    expect(stageAgent(views, 'implementer')?.definition).toEqual(
      BUILTIN_AGENTS['implementer'],
    );
  });

  it('answers undefined for an agent that is disabled, archived or unknown: nothing stands in for it', () => {
    const disabled = effectiveAgents(
      company(),
      { ...empty, disabled: ['reviewer'] },
      ready,
    );

    const archived = effectiveAgents(
      {
        ...company(),
        reviewer: { ...(BUILTIN_AGENTS['reviewer'] as AgentDefinition), archived: true },
      },
      undefined,
      ready,
    );

    expect(stageAgent(disabled, 'reviewer')).toBeUndefined();
    expect(stageAgent(archived, 'reviewer')).toBeUndefined();
    expect(stageAgent(disabled, 'nobody')).toBeUndefined();
    expect(stageAgent([], 'implementer')).toBeUndefined();
  });

  it('uses a project override of the agent', () => {
    const project: ProjectAgents = {
      ...empty,
      overrides: { implementer: { instructions: 'House style.' } },
    };

    const picked = stageAgent(effectiveAgents(company(), project, ready), 'implementer');

    expect(picked?.definition.instructions).toBe('House style.');
  });
});

describe('shippedImplementer', () => {
  it('is the built-in implementer whatever the stored roster says', () => {
    const view = shippedImplementer();

    expect(view).toMatchObject({ id: 'implementer', tags: ['builtin'] });
    expect(view.definition).toEqual(BUILTIN_AGENTS['implementer']);
    expect(view.hash).toBe(agentHash(BUILTIN_AGENTS['implementer']));
  });
});
