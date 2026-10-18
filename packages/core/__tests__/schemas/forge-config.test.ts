/**
 * Tests for the Forge config schemas and the shipped default `.forge/config/forge.yaml`.
 *
 * Why: the model matrix and engine limits are the dials that decide what the Director
 *   spends and how hard it pushes; they live in yaml (code.md rule 9) and a typo must fail
 *   at load, not mid-ticket. Parsing the file that ships in the repo pins that the default
 *   config is valid and still says what d-0060 decided (opus for Director steps, sonnet for
 *   Workers in every lane).
 *
 * Pins: the default forge.yaml parses; its models match d-0060; tick interval below 10 s,
 *   a missing step model and unknown lanes are rejected; every retry family is configured.
 * Depends on: src/schemas/forge-config, yaml, node:fs, vitest.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { EngineConfig, ForgeConfig, ModelMatrix } from '#/schemas/forge-config.js';

/** The yaml carries the model matrix and engine limits; the `director` section is built in only (d-0150). */
const YamlConfig = ForgeConfig.omit({ director: true, agents: true, pipelines: true });

const defaultYaml = (): unknown =>
  parse(
    readFileSync(
      new URL('../../../../.forge/config/forge.yaml', import.meta.url),
      'utf8',
    ),
  );

describe('default .forge/config/forge.yaml', () => {
  it('parses against ForgeConfig', () => {
    const parsed = YamlConfig.safeParse(defaultYaml());
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it('matches d-0060 and d-0150: opus for the judging Director steps, sonnet for the quick turns and every Worker lane', () => {
    const { models } = YamlConfig.parse(defaultYaml());
    expect(models.director).toEqual({
      triage: 'opus',
      dispatch_prompt: 'opus',
      steer_reply: 'opus',
      card_chat: 'opus',
      card_survey: 'opus',
      grill_turn: 'sonnet',
      verify: 'opus',
      enhance: 'opus',
      write_plan: 'opus',
      approve_plan: 'opus',
      custom_step: 'sonnet',
      ticket_answer: 'sonnet',
      ticket_recover: 'opus',
      draft_agent: 'sonnet',
      ticket_check: 'opus',
      pick_substitute: 'sonnet',
    });

    expect(models.worker).toEqual({
      express: 'sonnet',
      standard: 'sonnet',
      full: 'sonnet',
    });
  });

  it('ships the brief defaults: 30 s tick, 3 re-wakes per hour, one step retry', () => {
    const { engine } = YamlConfig.parse(defaultYaml());
    expect(engine.tick_interval_ms).toBe(30_000);
    expect(engine.rewake_cap).toEqual({ max: 3, window_ms: 3_600_000 });
    expect(engine.step_retries).toBe(1);
    expect(engine.confidence_threshold).toBe(0.7);
  });
});

describe('ModelMatrix / EngineConfig', () => {
  const engine = (): Record<string, unknown> =>
    (defaultYaml() as { engine: Record<string, unknown> }).engine;

  it('rejects a tick interval under the 10 s floor', () => {
    expect(EngineConfig.safeParse({ ...engine(), tick_interval_ms: 9_999 }).success).toBe(
      false,
    );
  });

  it('rejects a matrix with a missing Director step or an empty model', () => {
    const { models } = YamlConfig.parse(defaultYaml());
    const { triage: _t, ...rest } = models.director;
    void _t;
    expect(ModelMatrix.safeParse({ ...models, director: rest }).success).toBe(false);
    expect(
      ModelMatrix.safeParse({ ...models, worker: { ...models.worker, full: '' } })
        .success,
    ).toBe(false);
  });

  it('rejects an unknown per-state limit key', () => {
    expect(
      EngineConfig.safeParse({ ...engine(), max_concurrent_by_state: { napping: 1 } })
        .success,
    ).toBe(false);
  });
});
