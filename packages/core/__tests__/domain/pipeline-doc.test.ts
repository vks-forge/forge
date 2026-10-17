/**
 * Pins how a pipeline edit lands in a stored override document.
 *
 * Why: every save writes the whole next document as one version, and the rules for how a lane
 *   edit lands keep "Reset", "unchanged" and "a better shipped default still reaches everyone"
 *   meaning the same thing: a lane's list replaces the whole lane, a list equal to what the lane
 *   would be anyway is not stored, and Reset is removing the key. A document that kept a copy of
 *   the shipped list would freeze an owner on today's default for ever.
 *
 * Pins: set replaces the lane whole; a list equal to the shipped list (company) or the company's
 *   list (project) removes the key; reset removes only that lane; empty `pipelines` objects are
 *   pruned; routing set and cleared; other keys of the document are untouched; the result still
 *   passes the override schemas and merges over the built-ins.
 * Depends on: src/domain/{pipeline-doc,builtin-pipelines,merge-config,builtin-config}, vitest.
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_CONFIG } from '#/domain/builtin-config.js';
import { BUILTIN_PIPELINES } from '#/domain/builtin-pipelines.js';
import { mergeConfig } from '#/domain/merge-config.js';
import {
  companyLaneOverridden,
  projectLaneOverridden,
  resetCompanyLane,
  resetProjectLane,
  setCompanyLane,
  setProjectLane,
  setProjectRouting,
} from '#/domain/pipeline-doc.js';
import type { PipelineDefinition } from '#/schemas/pipeline.js';

const lean: PipelineDefinition = {
  stages: [
    { id: 'implementer', kind: 'agent', label: 'Implement', agent: 'implementer' },
    { id: 'g1', kind: 'script_gate', label: 'Gate G1', run: { builtin: 'g1' } },
    { id: 'merge', kind: 'merge', label: 'Merge', locked: true },
  ],
};

describe('company documents', () => {
  it('stores an edited lane whole, keeps other keys and drops it again when equal to the shipped list', () => {
    const doc = { engine: { max_concurrent_global: 4 } };
    const edited = setCompanyLane(doc, 'standard', lean);

    expect(edited.engine).toEqual(doc.engine);
    expect(edited.pipelines).toEqual({ standard: lean });
    expect(companyLaneOverridden(edited, 'standard')).toBe(true);

    const back = setCompanyLane(edited, 'standard', BUILTIN_PIPELINES.standard);

    expect(back).toEqual(doc);
    expect(companyLaneOverridden(back, 'standard')).toBe(false);
  });

  it('resets one lane and prunes the empty pipelines object', () => {
    const two = setCompanyLane(setCompanyLane({}, 'standard', lean), 'full', lean);

    expect(resetCompanyLane(two, 'standard').pipelines).toEqual({ full: lean });
    expect(resetCompanyLane(resetCompanyLane(two, 'standard'), 'full')).toEqual({});
    expect(resetCompanyLane({}, 'express')).toEqual({});
  });

  it('merges over the built-ins: the edited lane replaces, the others stay shipped', () => {
    const forge = mergeConfig(BUILTIN_CONFIG, setCompanyLane({}, 'standard', lean)).forge;

    expect(forge.pipelines.standard).toEqual(lean);
    expect(forge.pipelines.express).toEqual(BUILTIN_PIPELINES.express);
    expect(forge.pipelines.full).toEqual(BUILTIN_PIPELINES.full);
  });
});

describe('project documents', () => {
  it('stores a project lane, removes it when equal to the company list, and resets it', () => {
    const set = setProjectLane({}, 'standard', lean, BUILTIN_PIPELINES.standard);

    expect(set.pipelines).toEqual({ standard: lean });
    expect(projectLaneOverridden(set, 'standard')).toBe(true);
    expect(
      setProjectLane(
        set,
        'standard',
        BUILTIN_PIPELINES.standard,
        BUILTIN_PIPELINES.standard,
      ),
    ).toEqual({});

    expect(resetProjectLane(set, 'standard')).toEqual({});
    expect(resetProjectLane({}, 'standard')).toEqual({});
  });

  it('sets and clears routing without touching the lanes', () => {
    const withLane = setProjectLane({}, 'full', lean, BUILTIN_PIPELINES.full);
    const rules = [{ id: 'net', paths: ['**/*.tf'], add: 'critic' }];
    const routed = setProjectRouting(withLane, rules);

    expect(routed.pipelines).toEqual({ full: lean, routing: rules });
    expect(setProjectRouting(routed, []).pipelines).toEqual({ full: lean });
    expect(setProjectRouting(setProjectRouting({}, rules), [])).toEqual({});
  });

  it('merges over the company settings with routing defaulting to none', () => {
    const doc = setProjectLane({}, 'standard', lean, BUILTIN_PIPELINES.standard);
    const project = mergeConfig(BUILTIN_CONFIG, {}, doc).project;

    expect(project.pipelines?.standard).toEqual(lean);
    expect(project.pipelines?.routing).toEqual([]);
  });
});
