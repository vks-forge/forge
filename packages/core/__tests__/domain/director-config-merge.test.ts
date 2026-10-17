/**
 * Tests for the `director` settings section and its project override.
 *
 * Why: the Director's flow and playbooks are edited per company and per project, and the engine
 *   reads one effective `forge.director` for a project. A project that overrides one playbook
 *   must keep the rest, a project flow replaces the company flow whole, and a flow that breaks
 *   the locked-step rules or names a playbook that does not exist must be refused when it is
 *   saved, not when a card is planned.
 *
 * Pins: built-in director config validates and ships the six playbooks; a project override of
 *   one playbook or one limit merges key by key; a project flow replaces the flow; an invalid
 *   flow, an unknown playbook and an unknown key are refused as InvalidInputError.
 * Depends on: src/domain/merge-config, src/domain/builtin-config, vitest.
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_CONFIG } from '#/domain/builtin-config.js';
import { BUILTIN_DIRECTOR_CONFIG } from '#/domain/builtin-director.js';
import { mergeCompany, mergeConfig } from '#/domain/merge-config.js';
import { DirectorConfig } from '#/schemas/director-config.js';
import { STEP_NAMES } from '#/schemas/steps.js';
import { InvalidInputError } from '#/shared/errors.js';

describe('built-in director config', () => {
  it('validates and ships the eight playbooks with real method text', () => {
    expect(DirectorConfig.safeParse(BUILTIN_DIRECTOR_CONFIG).success).toBe(true);
    expect(Object.keys(BUILTIN_DIRECTOR_CONFIG.playbooks).sort()).toEqual([
      'answer-worker',
      'approve-plan',
      'enhance-decisions',
      'plan-grill',
      'plan-to-tickets',
      'recover-failure',
      'verify-plan',
      'write-plan',
    ]);

    for (const pb of Object.values(BUILTIN_DIRECTOR_CONFIG.playbooks)) {
      expect(pb.body.split('\n').length).toBeGreaterThanOrEqual(30);
      expect(pb.body).not.toMatch(/placeholder/i);
    }
  });

  it('has a timeout for every step name', () => {
    expect(Object.keys(BUILTIN_DIRECTOR_CONFIG.step_timeouts_ms)).toHaveLength(
      STEP_NAMES.length,
    );
  });
});

describe('mergeConfig with a director override', () => {
  it('merges a company override of one playbook and one limit key by key', () => {
    const company = mergeCompany(BUILTIN_CONFIG.forge, {
      director: {
        house_rules: 'Prefer small tickets.',
        grill: { max_rounds: 5 },
        playbooks: { 'plan-grill': { body: 'custom grill method' } },
      },
    });

    expect(company.director.house_rules).toBe('Prefer small tickets.');
    expect(company.director.grill).toEqual({ max_questions_per_round: 8, max_rounds: 5 });
    expect(company.director.playbooks['plan-grill']).toEqual({
      title: BUILTIN_DIRECTOR_CONFIG.playbooks['plan-grill']?.title,
      body: 'custom grill method',
    });

    expect(company.director.playbooks['write-plan']).toEqual(
      BUILTIN_DIRECTOR_CONFIG.playbooks['write-plan'],
    );
  });

  it('lays the project override over the company override in the effective forge.director', () => {
    const effective = mergeConfig(
      BUILTIN_CONFIG,
      { director: { house_rules: 'company rule', approval_mode: 'always_ask' } },
      { director: { house_rules: 'project rule' } },
    );

    expect(effective.forge.director.house_rules).toBe('project rule');
    expect(effective.forge.director.approval_mode).toBe('always_ask');
  });

  it('replaces the flow whole when a project names its own', () => {
    const flow = BUILTIN_DIRECTOR_CONFIG.flow.filter((s) => s.id !== 'enhance');

    const effective = mergeConfig(BUILTIN_CONFIG, {}, { director: { flow } });

    expect(effective.forge.director.flow.map((s) => s.id)).toEqual([
      'survey',
      'grill',
      'verify',
      'write_plan',
      'approve',
    ]);
  });

  it('refuses a flow that breaks the locked-step rules', () => {
    const flow = BUILTIN_DIRECTOR_CONFIG.flow.filter((s) => s.kind !== 'approve');

    expect(() => mergeConfig(BUILTIN_CONFIG, {}, { director: { flow } })).toThrow(
      InvalidInputError,
    );
  });

  it('refuses a step that names a playbook that does not exist', () => {
    const flow = BUILTIN_DIRECTOR_CONFIG.flow.map((s) =>
      s.id === 'verify' ? { ...s, playbook_id: 'no-such-playbook' } : s,
    );

    expect(() => mergeConfig(BUILTIN_CONFIG, { director: { flow } })).toThrow(
      InvalidInputError,
    );
  });

  it('refuses an unknown director key and a non-positive limit', () => {
    expect(() => mergeConfig(BUILTIN_CONFIG, { director: { nope: 1 } } as never)).toThrow(
      InvalidInputError,
    );

    expect(() =>
      mergeConfig(BUILTIN_CONFIG, {}, { director: { read_caps: { max_files: 0 } } }),
    ).toThrow(InvalidInputError);
  });
});
