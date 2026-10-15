/**
 * Tests for mergeConfig, the built-in defaults and the override schemas.
 *
 * Why: the engine runs on whatever mergeConfig returns, so the layering rule (project over
 *   company over built-ins, lists replaced, objects merged) and the refusal of bad
 *   overrides must hold for every input, not just the examples. The built-ins must also
 *   equal the shipped forge.yaml until that file is retired, so moving settings into the
 *   database changes no behaviour (d-0085).
 *
 * Pins: BUILTIN_FORGE_CONFIG equals parsed forge.yaml and validates; empty overrides give
 *   the defaults back; a project wins over the company; arrays replace; unknown keys,
 *   project identity and invalid values throw InvalidInputError; property tests for
 *   identity, precedence and "valid result or typed error".
 * Depends on: src/domain/merge-config, src/domain/builtin-config, yaml, node:fs,
 *   fast-check, vitest.
 */

import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { BUILTIN_CONFIG, BUILTIN_FORGE_CONFIG } from '#/domain/builtin-config.js';
import { mergeCompany, mergeConfig } from '#/domain/merge-config.js';
import { EffectiveConfig } from '#/schemas/config-override.js';
import { ForgeConfig } from '#/schemas/forge-config.js';
import { InvalidInputError } from '#/shared/errors.js';

const yamlConfig = (): unknown =>
  parse(
    readFileSync(
      new URL('../../../../.forge/config/forge.yaml', import.meta.url),
      'utf8',
    ),
  );

describe('built-in defaults', () => {
  it('equal what .forge/config/forge.yaml parses to', () => {
    expect(BUILTIN_FORGE_CONFIG).toEqual(ForgeConfig.parse(yamlConfig()));
  });

  it('validate against the full effective schema', () => {
    expect(EffectiveConfig.safeParse(BUILTIN_CONFIG).success).toBe(true);
  });
});

describe('mergeConfig', () => {
  it('merges objects key by key and leaves siblings alone', () => {
    const out = mergeConfig(BUILTIN_CONFIG, {
      engine: { max_concurrent_global: 7, retry: { crash: { max_attempts: 4 } } },
    });

    expect(out.forge.engine.max_concurrent_global).toBe(7);
    expect(out.forge.engine.retry.crash).toEqual({ delay_ms: 10_000, max_attempts: 4 });
    expect(out.forge.engine.retry.stall).toEqual(BUILTIN_FORGE_CONFIG.engine.retry.stall);
    expect(out.forge.models).toEqual(BUILTIN_FORGE_CONFIG.models);
  });

  it('merges partial records by key', () => {
    const out = mergeConfig(BUILTIN_CONFIG, {
      engine: { max_concurrent_by_state: { verifying: 2 } },
    });

    expect(out.forge.engine.max_concurrent_by_state).toEqual({
      in_progress: 3,
      verifying: 2,
    });
  });

  it('replaces arrays instead of concatenating', () => {
    const out = mergeConfig(BUILTIN_CONFIG, {}, { tier_c_globs: ['db/**'] });

    expect(out.project.tier_c_globs).toEqual(['db/**']);
  });

  it('lets the project win over the company, and the company over the built-ins', () => {
    const out = mergeConfig(
      BUILTIN_CONFIG,
      { models: { worker: { standard: 'opus' } } },
      { default_harness: 'other' },
    );

    expect(out.forge.models.worker.standard).toBe('opus');
    expect(out.project.default_harness).toBe('other');
  });

  it('rejects unknown keys, project identity and invalid values with a typed error', () => {
    expect(() => mergeConfig(BUILTIN_CONFIG, { engine: { nope: 1 } } as never)).toThrow(
      InvalidInputError,
    );

    expect(() => mergeConfig(BUILTIN_CONFIG, {}, { slug: 'x' } as never)).toThrow(
      InvalidInputError,
    );

    expect(() =>
      mergeConfig(BUILTIN_CONFIG, { engine: { tick_interval_ms: 5 } }),
    ).toThrow(InvalidInputError);
  });

  it('mergeCompany applies only the company layer', () => {
    expect(
      mergeCompany(BUILTIN_FORGE_CONFIG, { engine: { max_concurrent_global: 9 } }).engine
        .max_concurrent_global,
    ).toBe(9);
  });
});

const slots = fc.integer({ min: 1, max: 50 });
const harness = fc.string({ minLength: 1, maxLength: 12 });
const globs = fc.array(fc.string({ minLength: 1, maxLength: 8 }), { maxLength: 4 });

const companyArb = fc.record(
  {
    models: fc.record(
      { worker: fc.record({ standard: harness }, { requiredKeys: [] }) },
      { requiredKeys: [] },
    ),
    engine: fc.record(
      {
        max_concurrent_global: slots,
        confidence_threshold: fc.double({ min: 0, max: 1, noNaN: true }),
        max_concurrent_by_state: fc.record({ verifying: slots }, { requiredKeys: [] }),
      },
      { requiredKeys: [] },
    ),
  },
  { requiredKeys: [] },
);

const projectArb = fc.record(
  { default_harness: harness, tier_c_globs: globs },
  { requiredKeys: [] },
);

describe('mergeConfig properties', () => {
  it('identity: empty overrides return the defaults', () => {
    expect(mergeConfig(BUILTIN_CONFIG, {}, {})).toEqual(BUILTIN_CONFIG);
    expect(mergeConfig(BUILTIN_CONFIG)).toEqual(BUILTIN_CONFIG);
  });

  it('project wins: a project value always shows in the result, whatever the company says', () => {
    fc.assert(
      fc.property(companyArb, projectArb, (company, project) => {
        const out = mergeConfig(BUILTIN_CONFIG, company, project);

        if (project.default_harness !== undefined) {
          expect(out.project.default_harness).toBe(project.default_harness);
        }

        if (project.tier_c_globs !== undefined) {
          expect(out.project.tier_c_globs).toEqual(project.tier_c_globs);
        }

        if (company.engine?.max_concurrent_global !== undefined) {
          expect(out.forge.engine.max_concurrent_global).toBe(
            company.engine.max_concurrent_global,
          );
        }
      }),
    );
  });

  it('is idempotent: merging the result as the company layer changes nothing', () => {
    fc.assert(
      fc.property(companyArb, projectArb, (company, project) => {
        const once = mergeConfig(BUILTIN_CONFIG, company, project);

        expect(mergeConfig(BUILTIN_CONFIG, once.forge, once.project)).toEqual(once);
      }),
    );
  });

  it('always returns a valid config or throws InvalidInputError, never anything else', () => {
    fc.assert(
      fc.property(fc.jsonValue(), fc.jsonValue(), (company, project) => {
        try {
          const out = mergeConfig(BUILTIN_CONFIG, company as never, project as never);

          expect(EffectiveConfig.safeParse(out).success).toBe(true);
        } catch (error) {
          expect(error).toBeInstanceOf(InvalidInputError);
        }
      }),
    );
  });
});
