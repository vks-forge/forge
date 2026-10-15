/**
 * Tests for the legacy company settings migration and the layered Worker limits.
 *
 * Why: installs that saved a Worker limit before layered limits (d-0097) hold a stored
 *   version that says `engine.global_slots`. If an upgrade stopped reading it, the owner's
 *   limit would silently reset to the default, or the whole settings page would fail to
 *   load. The new limits must also merge key by key, so a project's override of one
 *   harness cap does not wipe the others.
 *
 * Pins: global_slots is read as max_concurrent_global, the new key wins when both are
 *   present, other documents pass through untouched, the layered defaults match d-0097,
 *   and a per-harness override merges into the default.
 * Depends on: src/domain/legacy-company-doc, src/domain/merge-config, vitest.
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_CONFIG } from '#/domain/builtin-config.js';
import { migrateLegacyCompanyDoc } from '#/domain/legacy-company-doc.js';
import { mergeConfig } from '#/domain/merge-config.js';
import { InvalidInputError } from '#/shared/errors.js';

describe('migrateLegacyCompanyDoc', () => {
  it('renames engine.global_slots and keeps the other engine keys', () => {
    expect(
      migrateLegacyCompanyDoc({ engine: { global_slots: 5, stall_ms: 9000 } }),
    ).toEqual({
      engine: { max_concurrent_global: 5, stall_ms: 9000 },
    });
  });

  it('lets an explicit new key win and drops the old one', () => {
    expect(
      migrateLegacyCompanyDoc({ engine: { global_slots: 5, max_concurrent_global: 2 } }),
    ).toEqual({ engine: { max_concurrent_global: 2 } });
  });

  it('returns documents without the old key as they are', () => {
    const doc = { engine: { stall_ms: 9000 } };

    expect(migrateLegacyCompanyDoc(doc)).toBe(doc);
    expect(migrateLegacyCompanyDoc(null)).toBeNull();
    expect(migrateLegacyCompanyDoc('x')).toBe('x');
  });
});

describe('layered Worker limits', () => {
  it('ships d-0097 defaults: 2 overall, 1 per project, 2 per harness, 1 h quota wait', () => {
    const { engine } = BUILTIN_CONFIG.forge;

    expect(engine.max_concurrent_global).toBe(2);
    expect(engine.max_concurrent_per_project).toBe(1);
    expect(engine.max_concurrent_per_harness).toEqual({ default: 2, by_id: {} });
    expect(engine.quota_default_pause_ms).toBe(3_600_000);
    expect(engine.harness_fallbacks).toEqual([]);
  });

  it('reads a stored global_slots override as the global limit', () => {
    const out = mergeConfig(BUILTIN_CONFIG, { engine: { global_slots: 7 } } as never);

    expect(out.forge.engine.max_concurrent_global).toBe(7);
  });

  it('merges a per-harness cap into the default instead of replacing it', () => {
    const out = mergeConfig(BUILTIN_CONFIG, {
      engine: { max_concurrent_per_harness: { by_id: { codex: 1 } } },
    });

    expect(out.forge.engine.max_concurrent_per_harness).toEqual({
      default: 2,
      by_id: { codex: 1 },
    });
  });

  it('accepts a project cap and fallback list, and refuses a zero cap', () => {
    const out = mergeConfig(
      BUILTIN_CONFIG,
      {},
      { max_concurrent: 1, harness_fallbacks: ['codex'] },
    );

    expect(out.project.max_concurrent).toBe(1);
    expect(out.project.harness_fallbacks).toEqual(['codex']);
    expect(() => mergeConfig(BUILTIN_CONFIG, {}, { max_concurrent: 0 })).toThrow(
      InvalidInputError,
    );
  });
});
