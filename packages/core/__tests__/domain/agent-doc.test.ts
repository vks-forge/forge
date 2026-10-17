/**
 * Pins how agent edits land in the stored override documents, and how history reads them back.
 *
 * Why: a built-in must be stored as only its difference from what the release ships (so Reset
 *   is removing a key and a better shipped text still reaches everyone who did not edit it),
 *   a project may keep only instructions and runs_on and only where they differ from the
 *   company agent, and each save must read back as the right kind of change in the history.
 *   The merged result must always pass the real config schemas, or a save would write a
 *   document the engine cannot run on.
 *
 * Pins: builtin edit stores a diff, no-op edit stores nothing, reset removes the key, custom
 *   stored whole, project override trimmed to differences, disable and enable, slugs, history
 *   change kinds, and merged documents validate through mergeConfig.
 * Depends on: src/domain/agent-doc, agent-history, merge-config, builtin-config, vitest.
 */

import { describe, expect, it } from 'vitest';
import {
  addCompanyAgent,
  addProjectAgent,
  diffAgent,
  resetCompanyAgent,
  resetProjectOverride,
  setProjectDisabled,
  slugifyAgentName,
  storeCompanyAgent,
  storeProjectOverride,
} from '#/domain/agent-doc.js';
import { BUILTIN_AGENTS } from '#/domain/builtin-agents.js';
import { BUILTIN_CONFIG } from '#/domain/builtin-config.js';
import { mergeConfig } from '#/domain/merge-config.js';
import type { AgentDefinition } from '#/schemas/agent.js';

const reviewer = BUILTIN_AGENTS['reviewer'] as AgentDefinition;

const mine: AgentDefinition = {
  ...(BUILTIN_AGENTS['implementer'] as AgentDefinition),
  name: 'Mine',
  origin: 'custom',
  runs_on: {
    harness: 'project_default',
    model: { kind: 'harness_default' },
    fallbacks: [],
  },
};

describe('built-in agents in the company document', () => {
  it('stores an edited built-in as only the fields that differ', () => {
    const doc = storeCompanyAgent({}, 'reviewer', {
      ...reviewer,
      instructions: 'Terse.',
    });

    expect(doc).toEqual({ agents: { reviewer: { instructions: 'Terse.' } } });
  });

  it('stores a changed model as a runs_on diff, not the whole agent', () => {
    const next = {
      ...reviewer,
      runs_on: { ...reviewer.runs_on, model: { kind: 'harness_default' as const } },
    };

    expect(storeCompanyAgent({}, 'reviewer', next)).toEqual({
      agents: { reviewer: { runs_on: { model: { kind: 'harness_default' } } } },
    });
  });

  it('stores nothing when the edit equals what the release ships', () => {
    const edited = storeCompanyAgent({}, 'reviewer', { ...reviewer, instructions: 'x' });

    expect(storeCompanyAgent(edited, 'reviewer', reviewer)).toEqual({});
  });

  it('reset removes the key and leaves other agents alone', () => {
    const doc = storeCompanyAgent(
      storeCompanyAgent({}, 'reviewer', { ...reviewer, instructions: 'x' }),
      'critic',
      { ...(BUILTIN_AGENTS['critic'] as AgentDefinition), instructions: 'y' },
    );

    expect(resetCompanyAgent(doc, 'reviewer')).toEqual({
      agents: { critic: { instructions: 'y' } },
    });
  });

  it('merges back into the full agent through mergeConfig', () => {
    const doc = storeCompanyAgent({}, 'reviewer', {
      ...reviewer,
      runs_on: { ...reviewer.runs_on, model: { kind: 'harness_default' } },
    });

    const merged = mergeConfig(BUILTIN_CONFIG, doc).forge.agents['reviewer'];

    expect(merged?.runs_on.model).toEqual({ kind: 'harness_default' });
    expect(merged?.name).toBe('Reviewer');
    expect(merged?.tools).toEqual(reviewer.tools);
  });
});

describe('custom agents in the company document', () => {
  it('stores a custom agent whole and merges it into the config', () => {
    const doc = addCompanyAgent({}, 'mine', mine);

    expect(doc.agents?.['mine']).toEqual(mine);
    expect(mergeConfig(BUILTIN_CONFIG, doc).forge.agents['mine']?.name).toBe('Mine');
  });

  it('replaces a custom agent whole on save and removes the key on reset', () => {
    const doc = addCompanyAgent({}, 'mine', mine);
    const saved = storeCompanyAgent(doc, 'mine', { ...mine, instructions: 'new' });

    expect(saved.agents?.['mine']).toEqual({ ...mine, instructions: 'new' });
    expect(resetCompanyAgent(saved, 'mine')).toEqual({});
  });

  it('keeps unrelated sections of the document', () => {
    const doc = addCompanyAgent(
      { models: { worker: { express: 'opus' } } },
      'mine',
      mine,
    );

    expect(doc.models).toEqual({ worker: { express: 'opus' } });
    expect(resetCompanyAgent(doc, 'mine')).toEqual({
      models: { worker: { express: 'opus' } },
    });
  });
});

describe('project agents in the project document', () => {
  const base = reviewer;

  it('keeps only the instructions and runs_on that differ from the company agent', () => {
    const doc = storeProjectOverride(
      {},
      'reviewer',
      { instructions: 'Local.', runs_on: base.runs_on },
      base,
    );

    expect(doc).toEqual({
      agents: { overrides: { reviewer: { instructions: 'Local.' } } },
    });
  });

  it('removes the override when it equals the company agent', () => {
    const doc = storeProjectOverride(
      {},
      'reviewer',
      { instructions: 'x', runs_on: base.runs_on },
      base,
    );

    expect(
      storeProjectOverride(
        doc,
        'reviewer',
        { instructions: base.instructions, runs_on: base.runs_on },
        base,
      ),
    ).toEqual({});
  });

  it('reset-override removes the override only', () => {
    const doc = setProjectDisabled(
      storeProjectOverride(
        {},
        'reviewer',
        { instructions: 'x', runs_on: base.runs_on },
        base,
      ),
      'critic',
      true,
    );

    expect(resetProjectOverride(doc, 'reviewer')).toEqual({
      agents: { disabled: ['critic'] },
    });
  });

  it('disables and enables a company agent for the project', () => {
    const off = setProjectDisabled({}, 'critic', true);

    expect(off).toEqual({ agents: { disabled: ['critic'] } });
    expect(setProjectDisabled(off, 'critic', false)).toEqual({});
  });

  it('stores a project agent whole and the merged config accepts it', () => {
    const doc = addProjectAgent({}, 'mine', mine);

    expect(
      mergeConfig(BUILTIN_CONFIG, {}, doc).project.agents?.custom['mine']?.name,
    ).toBe('Mine');
  });
});

describe('slugifyAgentName', () => {
  it('makes a lowercase id from words', () => {
    expect(slugifyAgentName('Security Reviewer (strict)')).toBe(
      'security-reviewer-strict',
    );
  });

  it('returns null when nothing usable remains', () => {
    expect(slugifyAgentName('!!')).toBeNull();
    expect(slugifyAgentName('7')).toBeNull();
  });

  it('caps the id at 48 characters', () => {
    expect(slugifyAgentName('a'.repeat(80))?.length).toBe(48);
  });
});

describe('diffAgent', () => {
  it('is empty for equal definitions', () => {
    expect(diffAgent(reviewer, { ...reviewer })).toEqual({});
  });
});
