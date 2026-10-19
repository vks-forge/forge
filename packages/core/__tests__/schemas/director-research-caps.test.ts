/**
 * Tests for the Director's research caps schema.
 *
 * Why: search and page reads cost nothing (self-hosted), so the owner may set high limits (d-0171);
 *   a ceiling held low refused a legitimate 40 runs per card. The ceilings are also the only server-side
 *   guard against an absurd value, so both the generous edge and the first value past it are pinned.
 *
 * Pins: the shipped defaults are valid; 40 runs per card and 50 searches are accepted; the top of every
 *   range is accepted and one past it is refused; the lower edges still hold.
 * Depends on: src/schemas/director-config, src/domain/builtin-director, vitest.
 */

import { describe, expect, it } from 'vitest';
import { BUILTIN_DIRECTOR_CONFIG } from '#/domain/builtin-director.js';
import { DirectorResearchCaps } from '#/schemas/director-config.js';

const base = BUILTIN_DIRECTOR_CONFIG.research;
const parse = (over: Record<string, number>) =>
  DirectorResearchCaps.safeParse({ ...base, ...over }).success;

describe('DirectorResearchCaps ranges', () => {
  it('accepts the shipped defaults', () => {
    expect(parse({})).toBe(true);
  });

  it('accepts 40 runs per card and 50 searches', () => {
    expect(parse({ max_runs_per_card: 40, max_searches: 50 })).toBe(true);
  });

  it.each([
    ['max_rounds', 10, 11],
    ['max_searches', 100, 101],
    ['max_fetches', 100, 101],
    ['max_bytes', 20_000_000, 20_000_001],
    ['max_runs_per_card', 100, 101],
  ])('accepts %s up to %i and refuses %i', (field, top, past) => {
    expect(parse({ [field]: top })).toBe(true);
    expect(parse({ [field]: past })).toBe(false);
  });

  it.each([
    ['max_rounds', 1, 0],
    ['max_searches', 0, -1],
    ['max_fetches', 0, -1],
    ['max_bytes', 50_000, 49_999],
    ['max_runs_per_card', 1, 0],
  ])('accepts %s from %i and refuses %i', (field, low, below) => {
    expect(parse({ [field]: low })).toBe(true);
    expect(parse({ [field]: below })).toBe(false);
  });
});
