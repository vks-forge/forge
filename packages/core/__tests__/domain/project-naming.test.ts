/**
 * Pins: suggested slugs and prefixes are always valid and never collide with a registered project.
 *
 * Why: the new-project form pre-fills these from a folder name; a suggestion the server would
 *   refuse (bad characters, a taken prefix) turns the one-click path into an error on first save.
 *
 * Depends on: src/domain/project-naming, src/schemas/ids.
 */

import { describe, expect, it } from 'vitest';
import { suggestPrefix, suggestSlug } from '#/domain/project-naming.js';
import { PROJECT_PREFIX_PATTERN } from '#/schemas/ids.js';

describe('suggestSlug', () => {
  it('lower-cases and joins words with a dash', () => {
    expect(suggestSlug('My Cool_App!', new Set())).toBe('my-cool-app');
  });

  it('numbers a slug that is taken', () => {
    expect(suggestSlug('forge', new Set(['forge', 'forge-2']))).toBe('forge-3');
  });

  it('falls back when the folder name has no leading letter', () => {
    expect(suggestSlug('2024', new Set())).toBe('project');
    expect(suggestSlug('***', new Set())).toBe('project');
  });
});

describe('suggestPrefix', () => {
  it('uses the initials of a multi-word slug', () => {
    expect(suggestPrefix('my-cool-app', new Set())).toBe('MCA');
  });

  it('uses the first letters of a one-word slug', () => {
    expect(suggestPrefix('forge', new Set())).toBe('FOR');
  });

  it('numbers a prefix that is taken and stays valid', () => {
    const prefix = suggestPrefix('forge', new Set(['FOR']));

    expect(prefix).toBe('FOR2');
    expect(PROJECT_PREFIX_PATTERN.test(prefix)).toBe(true);
  });
});
