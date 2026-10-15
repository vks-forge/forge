/**
 * Pins: a settings save sends the previous override with only this edit laid on top; records
 * (per-harness and per-state caps) are replaced whole so a removed row goes; untouched
 * settings are never pinned.
 *
 * Why: each saved version replaces the whole stored document. If a save sent only the edit,
 *   every earlier override would silently vanish; if it sent the full effective config, every
 *   built-in default would be frozen and a later better default would never reach the owner.
 * Depends on: src/domain/settings-patch, src/domain/config-path. Pure.
 */

import { describe, expect, it } from 'vitest';
import { getAt, sameValue, setAt } from '#/domain/config-path.js';
import { applyPatch, configPatch, describeChanges } from '#/domain/settings-patch.js';

const base = {
  engine: {
    max_concurrent_global: 2,
    stall_ms: 300_000,
    max_concurrent_per_harness: { default: 2, by_id: { a: 1, b: 2 } },
    max_concurrent_by_state: { in_progress: 3, verifying: 1 },
    harness_fallbacks: ['x'],
  },
};

describe('config paths', () => {
  it('reads, writes without mutating, and compares deeply', () => {
    const next = setAt(base, 'engine.stall_ms', 1);

    expect(getAt(next, 'engine.stall_ms')).toBe(1);
    expect(base.engine.stall_ms).toBe(300_000);
    expect(sameValue({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(sameValue({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe('configPatch', () => {
  it('holds only what changed', () => {
    const draft = setAt(base, 'engine.max_concurrent_global', 5);

    expect(configPatch(base, draft)).toEqual({ engine: { max_concurrent_global: 5 } });
  });

  it('is empty when nothing changed', () => {
    expect(configPatch(base, structuredClone(base))).toEqual({});
  });

  it('writes a whole record so a removed row is removed', () => {
    const draft = setAt(base, 'engine.max_concurrent_per_harness.by_id', { a: 1 });

    expect(configPatch(base, draft)).toEqual({
      engine: { max_concurrent_per_harness: { by_id: { a: 1 } } },
    });
  });

  it('writes an array whole', () => {
    const draft = setAt(base, 'engine.harness_fallbacks', ['y', 'z']);

    expect(configPatch(base, draft)).toEqual({
      engine: { harness_fallbacks: ['y', 'z'] },
    });
  });
});

describe('applyPatch', () => {
  it('keeps earlier overrides and adds the new one', () => {
    const previous = { engine: { max_concurrent_global: 3, shutdown_drain_ms: 20_000 } };

    expect(applyPatch(previous, { engine: { stall_ms: 1 } })).toEqual({
      engine: { max_concurrent_global: 3, shutdown_drain_ms: 20_000, stall_ms: 1 },
    });
  });

  it('replaces a whole-value record instead of merging into it', () => {
    const previous = {
      engine: { max_concurrent_per_harness: { by_id: { a: 1, b: 2 } } },
    };

    const patch = { engine: { max_concurrent_per_harness: { by_id: { a: 1 } } } };

    expect(applyPatch(previous, patch)).toEqual(patch);
  });
});

describe('describeChanges', () => {
  it('lists one line per changed setting', () => {
    expect(
      describeChanges({ engine: { stall_ms: 1 } }, { engine: { stall_ms: 2, x: 3 } }),
    ).toEqual(['engine.stall_ms = 2', 'engine.x = 3']);
  });
});
