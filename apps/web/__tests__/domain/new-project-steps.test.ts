/**
 * Pins: which problems belong to which add-project step, step order, and the byte wording.
 *
 * Why: Next must be blocked only by the current step's own problems (a bad prefix must not stop
 * the Folder step), and a refusal for a field on an earlier step must send the person to the step
 * that shows it. Byte counts appear in the git step before a snapshot is agreed to.
 * Depends on: domain/new-project-steps, domain/format-bytes.
 */

import { describe, expect, it } from 'vitest';
import { formatBytes } from '#/domain/format-bytes.js';
import {
  adjacentStep,
  problemsForStep,
  PROJECT_STEPS,
  stepOfField,
} from '#/domain/new-project-steps.js';

describe('project steps', () => {
  it('runs folder, git, details, checks, review', () => {
    expect(PROJECT_STEPS.map((s) => s.id)).toEqual([
      'folder',
      'git',
      'details',
      'checks',
      'review',
    ]);
  });

  it('stops at either end', () => {
    expect(adjacentStep('folder', -1)).toBe('folder');
    expect(adjacentStep('review', 1)).toBe('review');
    expect(adjacentStep('git', 1)).toBe('details');
  });

  it('maps every field to the step that shows it', () => {
    expect(stepOfField('slug')).toBe('details');
    expect(stepOfField('form')).toBe('details');
    expect(stepOfField('installation_id')).toBe('git');
    expect(stepOfField('checks')).toBe('checks');
    expect(stepOfField('local_path')).toBe('folder');
  });

  it('gives a step only its own problems, and review all of them', () => {
    const all = { slug: 'a', prefix: 'b', checks: 'c', connection: 'd' };

    expect(Object.keys(problemsForStep('details', all)).sort()).toEqual([
      'prefix',
      'slug',
    ]);

    expect(Object.keys(problemsForStep('git', all))).toEqual(['connection']);
    expect(Object.keys(problemsForStep('folder', all))).toEqual([]);
    expect(Object.keys(problemsForStep('review', all))).toHaveLength(4);
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [900, '900 B'],
    [1536, '1.5 KB'],
    [52_428_800, '50 MB'],
    [1_503_238_554, '1.4 GB'],
  ])('writes %i as %s', (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });
});
