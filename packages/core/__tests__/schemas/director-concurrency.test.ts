/**
 * Tests for the Director's `max_concurrent_steps` setting.
 *
 * Why: the Director now runs several model calls at once, bounded by this one setting. A stored
 *   settings row written before the field existed must still validate (a row that fails to parse
 *   makes the engine skip every tick), and no value may switch concurrency off or run away.
 *
 * Pins: a config without the field parses to 3; the shipped built-in says 3; 1 and 8 are accepted,
 *   0, 9 and a fraction refused; the field alone is a valid override (the default is not re-applied to an override).
 * Depends on: src/schemas/director-config, src/shared/deep-partial, src/domain/builtin-director, vitest.
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_DIRECTOR_CONFIG } from '#/domain/builtin-director.js';
import { DirectorConfig } from '#/schemas/director-config.js';
import { deepPartial } from '#/shared/deep-partial.js';

const { max_concurrent_steps: _field, ...oldRow } = BUILTIN_DIRECTOR_CONFIG;
void _field;

const parse = (value: unknown) => DirectorConfig.safeParse(value);
const override = deepPartial(DirectorConfig);

describe('DirectorConfig.max_concurrent_steps', () => {
  it('defaults to 3 for a config stored before the field existed', () => {
    const parsed = parse(oldRow);

    expect(parsed.success).toBe(true);
    expect(parsed.data?.max_concurrent_steps).toBe(3);
  });

  it('ships 3 in the built-in config', () => {
    expect(BUILTIN_DIRECTOR_CONFIG.max_concurrent_steps).toBe(3);
  });

  it.each([1, 3, 8])('accepts %i', (n) => {
    expect(parse({ ...oldRow, max_concurrent_steps: n }).success).toBe(true);
  });

  it.each([0, 9, -1, 2.5])('refuses %s', (n) => {
    expect(parse({ ...oldRow, max_concurrent_steps: n }).success).toBe(false);
  });

  it('accepts the field alone as a project override', () => {
    const parsed = override.safeParse({ max_concurrent_steps: 2 });

    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(override.parse({})).toEqual({});
  });
});
