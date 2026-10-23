/**
 * Tests for the cache fields of `SetupStep`.
 *
 * Why: a step's `cache_env` and `cache_outputs` decide which folders Forge sets in a tool's
 *   environment and which it copies between worktrees. A value that escapes the cache folder or
 *   the repository would let a typo in project settings write outside Forge's own folders, so it
 *   must be refused when settings are saved, and a step that says nothing must behave as before.
 *
 * Pins: defaults are empty (no cache), valid values parse, a `..` or absolute cache folder or
 *   output is refused, and a bad variable name is refused.
 * Depends on: schemas/setup-step, vitest.
 */

import { describe, expect, it } from 'vitest';
import { SetupStep } from '#/schemas/setup-step.js';

const base = { name: 'Install packages', command: 'npm ci' };

describe('SetupStep cache fields', () => {
  it('defaults to no cache so existing settings are unchanged', () => {
    const step = SetupStep.parse(base);

    expect(step.cache_env).toEqual({});
    expect(step.cache_outputs).toEqual([]);
    expect(step.toolchain).toBeUndefined();
  });

  it('accepts a download folder, restorable outputs and a toolchain probe', () => {
    const step = SetupStep.parse({
      ...base,
      cache_env: { npm_config_cache: 'node/npm' },
      cache_outputs: ['node_modules'],
      toolchain: 'node --version',
    });

    expect(step.cache_env).toEqual({ npm_config_cache: 'node/npm' });
    expect(step.cache_outputs).toEqual(['node_modules']);
  });

  it.each([['../outside'], ['/abs'], ['C:/abs']])(
    'refuses a cache folder or output that leaves its root: %s',
    (bad) => {
      expect(SetupStep.safeParse({ ...base, cache_env: { X: bad } }).success).toBe(false);
      expect(SetupStep.safeParse({ ...base, cache_outputs: [bad] }).success).toBe(false);
    },
  );

  it('refuses a bad variable name', () => {
    expect(SetupStep.safeParse({ ...base, cache_env: { '1BAD': 'x' } }).success).toBe(
      false,
    );
  });
});
