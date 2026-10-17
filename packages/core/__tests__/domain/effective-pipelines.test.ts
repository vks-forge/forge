/**
 * Pins the pipeline each lane runs, how it is described, and the warning about a critic that
 * shares the Worker's model family.
 *
 * Why: screens and the engine must agree on what a company list plus a project override adds up
 *   to, on whether a list is the shipped one or an edit, on whether it is inherited or the project's
 *   own, and on whether the lane can run today. The hash names the exact list so a ticket can record
 *   what it started on. The same-family warning (d-0073) is the one soft rule: allowed while one
 *   family is connected, but the owner should be told.
 *
 * Pins: tags for builtin and edited at company scope, project and company tags at project scope,
 *   a project lane replacing the company's whole, `live` from the lane list, a stable hash that
 *   changes with the list, and the warning for the shipped critic beside a Claude writer (and none
 *   for the reviewer or for a critic on another family).
 * Depends on: src/domain/{effective-pipelines,builtin-pipelines,effective-agents,builtin-agents}, vitest.
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_AGENTS } from '#/domain/builtin-agents.js';
import { BUILTIN_PIPELINES } from '#/domain/builtin-pipelines.js';
import { effectiveAgents } from '#/domain/effective-agents.js';
import { effectivePipelines, modelFamilyOf } from '#/domain/effective-pipelines.js';
import { pipelineHash } from '#/domain/stage-kinds.js';
import type { AgentDefinition } from '#/schemas/agent.js';
import type { LanePipelines, PipelineDefinition } from '#/schemas/pipeline.js';

const ready = () => ({ ready: true, reasons: [] });
const roster = effectiveAgents({ ...BUILTIN_AGENTS }, undefined, ready);

const lean: PipelineDefinition = {
  stages: [
    { id: 'implementer', kind: 'agent', label: 'Implement', agent: 'implementer' },
    { id: 'g1', kind: 'script_gate', label: 'Gate G1', run: { builtin: 'g1' } },
    { id: 'merge', kind: 'merge', label: 'Merge', locked: true },
  ],
};

describe('company scope', () => {
  it('tags the shipped lists builtin and carries their hashes', () => {
    const views = effectivePipelines(BUILTIN_PIPELINES, undefined, roster);

    for (const lane of ['express', 'standard', 'full'] as const) {
      expect(views[lane].tags).toEqual(['builtin']);
      expect(views[lane].hash).toBe(pipelineHash(BUILTIN_PIPELINES[lane]));
      expect(views[lane].definition).toEqual(BUILTIN_PIPELINES[lane]);
    }
  });

  it('tags an edited lane edited and gives it another hash', () => {
    const company: LanePipelines = { ...BUILTIN_PIPELINES, standard: lean };
    const views = effectivePipelines(company, undefined, roster);

    expect(views.standard.tags).toEqual(['edited']);
    expect(views.standard.hash).not.toBe(pipelineHash(BUILTIN_PIPELINES.standard));
    expect(views.express.tags).toEqual(['builtin']);
  });

  it('marks only the lanes in `live` as live, all of them by default', () => {
    expect(effectivePipelines(BUILTIN_PIPELINES, undefined, roster).full.live).toBe(true);

    const views = effectivePipelines(BUILTIN_PIPELINES, undefined, roster, [
      'express',
      'standard',
    ]);

    expect([views.express.live, views.standard.live, views.full.live]).toEqual([
      true,
      true,
      false,
    ]);
  });
});

describe('project scope', () => {
  it('lets a project list replace the company lane whole, tagged project; other lanes are inherited', () => {
    const views = effectivePipelines(
      BUILTIN_PIPELINES,
      { standard: lean, routing: [] },
      roster,
    );

    expect(views.standard.definition).toEqual(lean);
    expect(views.standard.tags).toEqual(['edited', 'project']);
    expect(views.express.tags).toEqual(['builtin', 'company']);
    expect(views.full.definition).toEqual(BUILTIN_PIPELINES.full);
  });

  it('describes an inherited edited company lane as edited and company', () => {
    const relabelled: PipelineDefinition = {
      stages: [
        { ...lean.stages[0]!, label: 'Build it' },
        lean.stages[1]!,
        lean.stages[2]!,
      ],
    };

    const views = effectivePipelines(
      { ...BUILTIN_PIPELINES, express: relabelled },
      { routing: [] },
      roster,
    );

    expect(views.express.tags).toEqual(['edited', 'company']);
  });
});

describe('same-family critic warning', () => {
  it('warns for the shipped critic beside a Claude writer, and not for the reviewer', () => {
    const views = effectivePipelines(BUILTIN_PIPELINES, undefined, roster);

    expect(views.full.warnings).toHaveLength(1);
    expect(views.full.warnings[0]).toContain('Critique');
    expect(views.full.warnings[0]).toContain('same model family');
    expect(views.standard.warnings).toEqual([]);
    expect(views.express.warnings).toEqual([]);
  });

  it('is silent when the critic runs on another family than the writers', () => {
    const critic: AgentDefinition = {
      ...(BUILTIN_AGENTS['critic'] as AgentDefinition),
      runs_on: {
        harness: 'project_default',
        model: { kind: 'model', id: 'gpt-5' },
        fallbacks: [],
      },
    };

    const other = effectiveAgents({ ...BUILTIN_AGENTS, critic }, undefined, ready);

    expect(effectivePipelines(BUILTIN_PIPELINES, undefined, other).full.warnings).toEqual(
      [],
    );
  });

  it('knows the model families', () => {
    expect(modelFamilyOf({ kind: 'forge_default' })).toBe('claude');
    expect(modelFamilyOf({ kind: 'harness_default' })).toBe('claude');
    expect(modelFamilyOf({ kind: 'model', id: 'Opus' })).toBe('claude');
    expect(modelFamilyOf({ kind: 'model', id: 'gpt-5' })).toBe('openai');
    expect(modelFamilyOf({ kind: 'model', id: 'gemini-3' })).toBe('google');
    expect(modelFamilyOf({ kind: 'model', id: 'mistral-large' })).toBe('mistral-large');
  });
});
